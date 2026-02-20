pub mod lima;

use async_trait::async_trait;
use std::path::PathBuf;
use std::time::Duration;

pub type SandboxId = String;
pub type SnapshotId = String;
pub type ExecId = String;

#[derive(Clone)]
pub struct ResourceLimits {
    pub vcpu: u32,
    pub memory_mb: u64,
    pub disk_mb: u64,
    pub sandbox_ttl: Option<Duration>,
    pub idle_ttl: Option<Duration>,
}

#[derive(Clone)]
pub struct NetworkPolicy {
    pub deny_all: bool,
    pub allow_domains: Vec<String>,
    pub allow_cidrs: Vec<String>,
}

#[derive(Clone)]
pub struct MountSpec {
    pub host_path: PathBuf,
    pub guest_path: PathBuf,
    pub read_only: bool,
}

#[derive(Clone)]
pub struct SandboxPolicy {
    pub network: NetworkPolicy,
    pub mounts: Vec<MountSpec>,
    pub enable_gpu: bool,
    pub enable_snapshotting: bool,
}

#[derive(Clone)]
pub struct SandboxSpec {
    pub base_image: String,
    pub working_dir: PathBuf,
    pub limits: ResourceLimits,
    pub policy: SandboxPolicy,
}

pub struct ExecSpec {
    pub argv: Vec<String>,
    pub env: Vec<(String, String)>,
    pub cwd: Option<PathBuf>,
    pub timeout: Duration,
}

pub struct ExecResult {
    pub exec_id: ExecId,
    pub exit_code: i32,
}

pub struct SnapshotMeta {
    pub snapshot_id: SnapshotId,
    pub sandbox_id: SandboxId,
    pub size_bytes: u64,
}

pub struct ProviderHealth {
    pub healthy: bool,
    pub version: Option<String>,
    pub snapshot_capable: bool,
    pub gpu_capable: bool,
}

#[async_trait]
pub trait SandboxProvider: Send + Sync {
    fn provider_name(&self) -> &'static str;

    async fn probe(&self) -> anyhow::Result<ProviderHealth>;

    // --- Lifecycle ---
    async fn create_sandbox(&self, spec: SandboxSpec) -> anyhow::Result<SandboxId>;
    async fn start_sandbox(&self, id: &SandboxId) -> anyhow::Result<()>;
    async fn stop_sandbox(&self, id: &SandboxId, force: bool) -> anyhow::Result<()>;
    async fn destroy_sandbox(&self, id: &SandboxId, force: bool) -> anyhow::Result<()>;

    // --- Execution ---
    async fn exec(
        &self,
        id: &SandboxId,
        spec: ExecSpec,
    ) -> anyhow::Result<ExecResult>;

    // --- Snapshot ---
    async fn create_snapshot(&self, id: &SandboxId)
        -> anyhow::Result<SnapshotMeta>;

    async fn restore_snapshot(
        &self,
        snapshot_id: &SnapshotId,
    ) -> anyhow::Result<SandboxId>;

    async fn delete_snapshot(&self, snapshot_id: &SnapshotId)
        -> anyhow::Result<()>;

    // --- Files ---
    async fn put_file(
        &self,
        id: &SandboxId,
        guest_path: PathBuf,
        content: Vec<u8>,
    ) -> anyhow::Result<()>;

    async fn get_file(
        &self,
        id: &SandboxId,
        guest_path: PathBuf,
    ) -> anyhow::Result<Vec<u8>>;
}
