pub mod pb {
    tonic::include_proto!("crucible.daemon.v1");
}

use clap::{Parser, Subcommand};
use pb::sandboxes_client::SandboxesClient;
use pb::{CreateSandboxRequest, SandboxSpec};
use pb::execution_client::ExecutionClient;
use pb::{ExecRequest, ExecSpec};

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
    },
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();
    
    // Connect to the daemon
    let mut sandboxes = SandboxesClient::connect("http://[::1]:7171").await?;
    let mut execution = ExecutionClient::connect("http://[::1]:7171").await?;

    match cli.command {
        Commands::Sandbox { action } => match action {
            SandboxCommands::Create { image } => {
                println!("Creating sandbox from image: {}", image);
                
                let request = tonic::Request::new(CreateSandboxRequest {
                    spec: Some(SandboxSpec {
                        base_image: image,
                        working_dir: "/work".to_string(),
                        provider: pb::ProviderType::ProviderLocalLima as i32,
                        labels: None,
                        limits: None,
                        policy: None,
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
        }
    }

    Ok(())
}
