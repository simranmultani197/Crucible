use crate::db::Db;
use crate::pb::snapshots_server::Snapshots;
use crate::pb::{
    CreateSnapshotRequest, DeleteSnapshotRequest, DeleteSnapshotResponse, 
    GarbageCollectSnapshotsRequest, GarbageCollectSnapshotsResponse, 
    GetSnapshotRequest, ListSnapshotsRequest, ListSnapshotsResponse, 
    RestoreSnapshotRequest, Snapshot, SnapshotSpec
};
use crate::provider::{SandboxId, SandboxProvider};
use crate::store::SnapshotStore;
use std::sync::Arc;
use tonic::{Request, Response, Status};

pub struct SnapshotService {
    provider: Arc<dyn SandboxProvider>,
    db: Db,
    store: Arc<SnapshotStore>,
}

impl SnapshotService {
    pub fn new(provider: Arc<dyn SandboxProvider>, db: Db, store: Arc<SnapshotStore>) -> Self {
        Self { provider, db, store }
    }
}

#[tonic::async_trait]
impl Snapshots for SnapshotService {
    async fn create_snapshot(
        &self,
        request: Request<CreateSnapshotRequest>,
    ) -> Result<Response<Snapshot>, Status> {
        let req = request.into_inner();
        let spec = req.spec.ok_or_else(|| Status::invalid_argument("Missing spec"))?;
        let snapshot_id = uuid::Uuid::new_v4().to_string();

        let tmp_dir = self.store.begin_snapshot(&snapshot_id).await
            .map_err(|e| Status::internal(format!("Failed to prepare tmp dir: {}", e)))?;

        // 1. Write `state=CREATING` to DB
        let provider_name = self.provider.provider_name();
        
        // Mode mapping
        let mode_str = match spec.mode {
            1 => "FULL",
            2 => "MEMORY_ONLY",
            _ => "FULL", // default
        };

        self.db.insert_snapshot(
            &snapshot_id,
            provider_name,
            &spec.sandbox_id,
            mode_str,
            &snapshot_id, // simple root for now
        ).await.map_err(|e| Status::internal(format!("DB error: {}", e)))?;

        // 2. Call `self.provider.create_snapshot(&spec.sandbox_id, &tmp_dir)`
        let meta = match self.provider.create_snapshot(&spec.sandbox_id, &tmp_dir).await {
            Ok(m) => m,
            Err(e) => {
                let _ = self.store.abort_snapshot(&snapshot_id).await;
                // Ideally also update DB to FAILED here
                return Err(Status::internal(format!("Provider snapshot failed: {}", e)));
            }
        };

        // 3. Gather hashes and metadata
        // 4. `self.store.commit_snapshot(&snapshot_id)`
        let _final_dir = self.store.commit_snapshot(&snapshot_id).await
            .map_err(|e| Status::internal(format!("Failed to commit disk store: {}", e)))?;

        // 5. Write `state=READY` to DB
        self.db.set_snapshot_ready(&snapshot_id, meta.size_bytes).await
            .map_err(|e| Status::internal(format!("DB finalize error: {}", e)))?;

        Ok(Response::new(Snapshot {
            snapshot_id,
            sandbox_id: spec.sandbox_id,
            name: spec.name,
            labels: spec.labels,
            created_at: Some(prost_types::Timestamp::date_time_nanos(2026, 1, 1, 0, 0, 0, 0).unwrap()),
            size_bytes: meta.size_bytes,
            parent_snapshot_id: String::new(),
            last_error: String::new(),
        }))
    }

    async fn get_snapshot(
        &self,
        _request: Request<GetSnapshotRequest>,
    ) -> Result<Response<Snapshot>, Status> {
        Err(Status::unimplemented("Not implemented"))
    }

    async fn list_snapshots(
        &self,
        _request: Request<ListSnapshotsRequest>,
    ) -> Result<Response<ListSnapshotsResponse>, Status> {
        Err(Status::unimplemented("Not implemented"))
    }

    async fn restore_snapshot(
        &self,
        request: Request<RestoreSnapshotRequest>,
    ) -> Result<Response<crate::pb::Sandbox>, Status> {
        let req = request.into_inner();
        let spec = req.spec.ok_or_else(|| Status::invalid_argument("Missing restore spec"))?;
        
        let state = self.db.get_snapshot_state(&spec.snapshot_id).await
            .map_err(|e| Status::not_found(format!("Snapshot not found: {}", e)))?;
            
        if state != "READY" {
            return Err(Status::failed_precondition("Snapshot is not READY"));
        }
        
        let snapshot_dir = self.store.get_snapshot_dir(&spec.snapshot_id)
            .ok_or_else(|| Status::internal("Snapshot directory missing COMPLETE marker"))?;
            
        let new_sandbox_id = if spec.target_sandbox_id.is_empty() {
            uuid::Uuid::new_v4().to_string()
        } else {
            spec.target_sandbox_id
        };
        
        self.provider.restore_snapshot(&spec.snapshot_id, &new_sandbox_id, &snapshot_dir).await
            .map_err(|e| Status::internal(format!("Provider restore failed: {}", e)))?;
            
        Ok(Response::new(crate::pb::Sandbox {
            sandbox_id: new_sandbox_id,
            provider: crate::pb::ProviderType::ProviderLocalLima as i32,
            state: crate::pb::SandboxState::SandboxReady as i32,
            spec: spec.new_sandbox_spec,
            created_at: Some(prost_types::Timestamp::date_time_nanos(2026, 1, 1, 0, 0, 0, 0).unwrap()),
            updated_at: Some(prost_types::Timestamp::date_time_nanos(2026, 1, 1, 0, 0, 0, 0).unwrap()),
            last_error: String::new(),
            usage: None,
        }))
    }

    async fn delete_snapshot(
        &self,
        _request: Request<DeleteSnapshotRequest>,
    ) -> Result<Response<DeleteSnapshotResponse>, Status> {
        Err(Status::unimplemented("Not implemented"))
    }

    async fn garbage_collect_snapshots(
        &self,
        request: Request<GarbageCollectSnapshotsRequest>,
    ) -> Result<Response<GarbageCollectSnapshotsResponse>, Status> {
        let req = request.into_inner();
        let keep_latest = if req.keep_latest_per_sandbox > 0 { req.keep_latest_per_sandbox } else { 5 };
        
        let candidates = self.db.get_gc_candidates(keep_latest).await
            .map_err(|e| Status::internal(format!("DB query failed: {}", e)))?;
            
        let mut deleted_snapshot_ids = Vec::new();
        let mut reclaimed_bytes = 0;
        
        for (id, size) in candidates {
            if !req.dry_run {
                let _ = self.store.delete_snapshot(&id).await;
                let _ = self.db.mark_snapshot_deleted(&id).await;
            }
            deleted_snapshot_ids.push(id);
            reclaimed_bytes += size;
        }

        Ok(Response::new(GarbageCollectSnapshotsResponse {
            deleted_snapshot_ids,
            reclaimed_bytes,
        }))
    }
}
