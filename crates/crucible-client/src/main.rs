pub mod pb {
    tonic::include_proto!("crucible.daemon.v1");
}

use clap::{Parser, Subcommand};
use pb::sandboxes_client::SandboxesClient;
use pb::{CreateSandboxRequest, SandboxSpec};
use pb::execution_client::ExecutionClient;
use pb::{ExecRequest, ExecSpec};
use pb::snapshots_client::SnapshotsClient;
use pb::{CreateSnapshotRequest, SnapshotSpec, RestoreSnapshotRequest, RestoreSpec, GarbageCollectSnapshotsRequest};

#[derive(Parser)]
#[command(author, version, about, long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Sandbox management operations
    Sandbox {
        #[command(subcommand)]
        action: SandboxCommands,
    },
    /// Snapshot management operations
    Snapshot {
        #[command(subcommand)]
        action: SnapshotCommands,
    },
    /// Execute a command in a running sandbox
    Exec {
        #[arg(short, long)]
        id: String,
        
        /// The command arguments to execute
        #[arg(last = true)]
        cmd: Vec<String>,
    },
}

#[derive(Subcommand)]
enum SandboxCommands {
    /// Create a new sandbox
    Create {
        #[arg(short, long)]
        image: String,
        /// Request hardware acceleration (GPU) for the sandbox
        #[arg(short, long)]
        gpu: bool,
    },
}

#[derive(Subcommand)]
enum SnapshotCommands {
    /// Create a new snapshot of a sandbox
    Create {
        #[arg(short, long)]
        sandbox_id: String,
        #[arg(short, long)]
        name: Option<String>,
    },
    /// Restore a snapshot into a new sandbox
    Restore {
        #[arg(short, long)]
        snapshot_id: String,
    },
    /// Garbage collect unreachable snapshots
    Gc {
        #[arg(short, long, default_value_t = 5)]
        keep_latest: u32,
        #[arg(short, long)]
        dry_run: bool,
    },
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();
    
    // Connect to the daemon
    let mut sandboxes = SandboxesClient::connect("http://[::1]:7171").await?;
    let mut execution = ExecutionClient::connect("http://[::1]:7171").await?;
    let mut snapshots = SnapshotsClient::connect("http://[::1]:7171").await?;

    match cli.command {
        Commands::Sandbox { action } => match action {
            SandboxCommands::Create { image, gpu } => {
                println!("Creating sandbox from image: {} (GPU: {})", image, gpu);
                
                let request = tonic::Request::new(CreateSandboxRequest {
                    spec: Some(SandboxSpec {
                        base_image: image,
                        working_dir: "/work".to_string(),
                        provider: pb::ProviderType::ProviderLocalLima as i32,
                        labels: None,
                        limits: None,
                        policy: Some(pb::SandboxPolicy {
                            policy_id: String::new(),
                            network: Some(pb::NetworkPolicy {
                                deny_all: true,
                                allow_domains: vec![],
                                allow_cidrs: vec![],
                                allow_loopback: true,
                            }),
                            mounts: Some(pb::MountPolicy { mounts: vec![] }),
                            enable_gpu: gpu,
                            enable_snapshotting: false,
                            strict_no_fallback: true,
                        }),
                        allow_pool_reuse: false,
                        init_cmd: vec![],
                    }),
                });

                let response = sandboxes.create_sandbox(request).await?;
                let sandbox = response.into_inner().sandbox.unwrap();
                println!("Success! Sandbox created.");
                println!("ID: {}", sandbox.sandbox_id);
            }
        },
        Commands::Exec { id, cmd } => {
            println!("Executing command in sandbox: {}", id);
            
            let request = tonic::Request::new(ExecRequest {
                spec: Some(ExecSpec {
                    sandbox_id: id,
                    argv: cmd,
                    shell: String::new(),
                    env: std::collections::HashMap::new(),
                    cwd: "/work".to_string(),
                    timeout_ms: 30000,
                    stream_stdout: false,
                    stream_stderr: false,
                    input_artifact_ids: vec![],
                })
            });

            let response = execution.exec(request).await?;
            let result = response.into_inner();
            
            println!("Exec ID: {}", result.exec_id);
            println!("Exit Code: {}", result.exit_code);
            
            // We're currently just relying on the provider to execute it. 
            // In a full implementation, `exec_stream` would yield these.
        },
        Commands::Snapshot { action } => match action {
            SnapshotCommands::Create { sandbox_id, name } => {
                println!("Requesting snapshot mapping for sandbox: {}", sandbox_id);
                let request = tonic::Request::new(CreateSnapshotRequest {
                    spec: Some(SnapshotSpec {
                        sandbox_id,
                        name: name.unwrap_or_default(),
                        labels: None,
                        mode: pb::snapshot_spec::Mode::Full as i32,
                    })
                });
                let response = snapshots.create_snapshot(request).await?;
                println!("Created Snapshot: {}", response.into_inner().snapshot_id);
            },
            SnapshotCommands::Restore { snapshot_id } => {
                println!("Restoring sandbox from snapshot: {}", snapshot_id);
                let request = tonic::Request::new(RestoreSnapshotRequest {
                    spec: Some(RestoreSpec {
                        snapshot_id,
                        target_sandbox_id: String::new(),
                        new_sandbox_spec: None,
                    })
                });
                let response = snapshots.restore_snapshot(request).await?;
                println!("Restored into new Sandbox ID: {}", response.into_inner().sandbox_id);
            },
            SnapshotCommands::Gc { keep_latest, dry_run } => {
                println!("Garbage Collecting (dry_run: {})", dry_run);
                let request = tonic::Request::new(GarbageCollectSnapshotsRequest {
                    keep_latest_per_sandbox: keep_latest,
                    max_total_bytes: 0,
                    dry_run,
                });
                let response = snapshots.garbage_collect_snapshots(request).await?;
                let stats = response.into_inner();
                println!("Deleted {} snapshots, reclaimed {} bytes.", stats.deleted_snapshot_ids.len(), stats.reclaimed_bytes);
            }
        }
    }

    Ok(())
}
