pub mod pb {
    tonic::include_proto!("crucible.daemon.v1");
}

pub mod provider;
pub mod server;
pub mod db;
pub mod store;

use crate::pb::sandboxes_server::SandboxesServer;
use crate::pb::execution_server::ExecutionServer;
use crate::pb::snapshots_server::SnapshotsServer;
use tonic::transport::Server;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let addr = "[::1]:7171".parse()?;
    
    // Initialize Database
    let db_url = "sqlite:crucible.db?mode=rwc";
    let db = db::Db::new(db_url).await?;
    println!("Crucible Database initialized at {}", db_url);

    // Initialize Store
    let store_path = std::path::PathBuf::from("/tmp/crucible_snapshots");
    let store = std::sync::Arc::new(store::SnapshotStore::new(&store_path).await?);
    println!("Crucible Store initialized at {:?}", store_path);

    // Initialize our simple Lima provider as the backend
    let lima_backend = std::sync::Arc::new(provider::lima::LimaProvider::new("crucible-worker"));
    
    // Create the gRPC services
    let sandbox_service = server::sandboxes::SandboxService::new(lima_backend.clone());
    let execution_service = server::execution::ExecutionService::new(lima_backend.clone());
    let snapshot_service = server::snapshots::SnapshotService::new(lima_backend.clone(), db.clone(), store.clone());

    println!("Crucible Daemon listening on {}", addr);

    Server::builder()
        .add_service(SandboxesServer::new(sandbox_service))
        .add_service(ExecutionServer::new(execution_service))
        .add_service(SnapshotsServer::new(snapshot_service))
        .serve(addr)
        .await?;

    Ok(())
}
