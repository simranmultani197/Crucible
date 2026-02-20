use crate::provider::{
    ExecResult, ExecSpec, ProviderHealth, SandboxId, SandboxProvider, SandboxSpec, SnapshotId,
    SnapshotMeta,
};
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use std::path::PathBuf;
use std::process::Stdio;
use tokio::process::Command;

pub struct LimaProvider {
    // The name of the background lima instance hosting the containers
    pub instance_name: String,
}

impl LimaProvider {
    pub fn new(instance_name: impl Into<String>) -> Self {
        Self {
            instance_name: instance_name.into(),
        }
    }

    /// Helper to run a raw command inside the Lima guest
    async fn run_in_guest(&self, args: &[&str]) -> Result<String> {
        let mut cmd = Command::new("limactl");
        cmd.arg("shell").arg(&self.instance_name);
        for arg in args {
            cmd.arg(arg);
        }

        let output = cmd.output().await?;
        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        } else {
            let err = String::from_utf8_lossy(&output.stderr);
            Err(anyhow!("Lima command failed: {}", err))
        }
    }
}

#[async_trait]
impl SandboxProvider for LimaProvider {
    fn provider_name(&self) -> &'static str {
        "local_lima"
    }

    async fn probe(&self) -> Result<ProviderHealth> {
        // Check if `limactl` is available
        match Command::new("limactl").arg("--version").output().await {
            Ok(output) if output.status.success() => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                
                // Check if the specific instance is running
                let list_out = Command::new("limactl")
                    .args(&["list", "--json"])
                    .output()
                    .await?;
                
                let is_running = String::from_utf8_lossy(&list_out.stdout)
                    .contains(&format!("\"name\":\"{}\",\"status\":\"Running\"", self.instance_name));

                Ok(ProviderHealth {
                    healthy: is_running,
                    version: Some(stdout.trim().to_string()),
                    snapshot_capable: false, // lima doesn't support instant snapshots natively yet
                    gpu_capable: false,
                })
            }
            _ => Ok(ProviderHealth {
                healthy: false,
                version: None,
                snapshot_capable: false,
                gpu_capable: false,
            }),
        }
    }

    // --- Lifecycle ---
    async fn create_sandbox(&self, spec: SandboxSpec) -> Result<SandboxId> {
        let id = uuid::Uuid::new_v4().to_string();
        
        // For the Lima mock provider, a "sandbox" is just an isolated directory in the guest
        // In a real krunvm/firecracker setup, this boots an actual isolated VM.
        let guest_dir = format!("/tmp/crucible_sandbox_{}", id);
        self.run_in_guest(&["mkdir", "-p", &guest_dir]).await?;

        Ok(id)
    }

    async fn start_sandbox(&self, _id: &SandboxId) -> Result<()> {
        // No-op for Lima directory isolates
        Ok(())
    }

    async fn stop_sandbox(&self, _id: &SandboxId, _force: bool) -> Result<()> {
        // No-op for Lima directory isolates
        Ok(())
    }

    async fn destroy_sandbox(&self, id: &SandboxId, _force: bool) -> Result<()> {
        let guest_dir = format!("/tmp/crucible_sandbox_{}", id);
        self.run_in_guest(&["rm", "-rf", &guest_dir]).await?;
        Ok(())
    }

    // --- Execution ---
    async fn exec(&self, id: &SandboxId, spec: ExecSpec) -> Result<ExecResult> {
        let guest_dir = format!("/tmp/crucible_sandbox_{}", id);
        let exec_id = uuid::Uuid::new_v4().to_string();

        let mut cmd = Command::new("limactl");
        cmd.arg("shell").arg(&self.instance_name);
        
        // Change to sandbox directory
        cmd.arg("sh").arg("-c").arg(format!(
            "cd {} && {}",
            guest_dir,
            spec.argv.join(" ")
        ));

        // Note: Real implementation needs handling of `spec.timeout` and `spec.env`
        let output = cmd.output().await?;

        Ok(ExecResult {
            exec_id,
            exit_code: output.status.code().unwrap_or(-1),
        })
    }

    // --- Snapshot ---
    async fn create_snapshot(&self, _id: &SandboxId) -> Result<SnapshotMeta> {
        Err(anyhow!("Snapshots are not supported by the Lima provider"))
    }

    async fn restore_snapshot(&self, _snapshot_id: &SnapshotId) -> Result<SandboxId> {
        Err(anyhow!("Snapshots are not supported by the Lima provider"))
    }

    async fn delete_snapshot(&self, _snapshot_id: &SnapshotId) -> Result<()> {
        Err(anyhow!("Snapshots are not supported by the Lima provider"))
    }

    // --- Files ---
    async fn put_file(&self, id: &SandboxId, guest_path: PathBuf, content: Vec<u8>) -> Result<()> {
        let guest_dir = format!("/tmp/crucible_sandbox_{}", id);
        let full_path = format!("{}/{}", guest_dir, guest_path.display());
        
        // We write the file locally to a temp path, then use `limactl cp` to move it in
        let temp_local = format!("/tmp/crucible_host_{}.tmp", uuid::Uuid::new_v4());
        std::fs::write(&temp_local, content)?;

        let dest = format!("{}:{}", self.instance_name, full_path);
        let status: std::process::ExitStatus = Command::new("limactl")
            .args(&["cp", &temp_local, &dest])
            .status()
            .await?;

        // Cleanup local temp
        let _ = std::fs::remove_file(&temp_local);

        if status.success() {
            Ok(())
        } else {
            Err(anyhow!("Failed to copy file into Lima guest"))
        }
    }

    async fn get_file(&self, id: &SandboxId, guest_path: PathBuf) -> Result<Vec<u8>> {
        let guest_dir = format!("/tmp/crucible_sandbox_{}", id);
        let full_path = format!("{}/{}", guest_dir, guest_path.display());
        
        let temp_local = format!("/tmp/crucible_host_{}.tmp", uuid::Uuid::new_v4());
        
        let src = format!("{}:{}", self.instance_name, full_path);
        let status: std::process::ExitStatus = Command::new("limactl")
            .args(&["cp", &src, &temp_local])
            .status()
            .await?;

        if status.success() {
            let content = std::fs::read(&temp_local)?;
            let _ = std::fs::remove_file(&temp_local);
            Ok(content)
        } else {
            Err(anyhow!("Failed to copy file from Lima guest"))
        }
    }
}
