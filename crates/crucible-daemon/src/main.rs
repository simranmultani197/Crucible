pub mod pb {
    tonic::include_proto!("crucible.daemon.v1");
}

pub mod provider;
pub mod server;

use crate::pb::sandboxes_server::SandboxesServer;
use crate::pb::execution_server::ExecutionServer;
use tonic::transport::Server;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let addr = "[::1]:7171".parse()?;
    
    // Initialize our simple Lima provider as the backend
    let lima_backend = std::sync::Arc::new(provider::lima::LimaProvider::new("crucible-worker"));
    
    // Create the gRPC services
    let sandbox_service = server::sandboxes::SandboxService::new(lima_backend.clone());
    let execution_service = server::execution::ExecutionService::new(lima_backend);

    println!("Crucible Daemon listening on {}", addr);

    Server::builder()
        .add_service(SandboxesServer::new(sandbox_service))
        .add_service(ExecutionServer::new(execution_service))
        .serve(addr)
        .await?;

    Ok(())
}
