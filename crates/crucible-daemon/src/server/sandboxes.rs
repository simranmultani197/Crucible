use crate::pb::sandboxes_server::Sandboxes;
use crate::pb::{
    CreateSandboxRequest, CreateSandboxResponse, DestroySandboxRequest, DestroySandboxResponse,
    GetSandboxRequest, ListSandboxesRequest, ListSandboxesResponse, Sandbox, StopSandboxRequest,
    WatchSandboxRequest, SandboxState, ProviderType,
};
use crate::provider::{SandboxProvider, SandboxSpec as ProviderSandboxSpec, ResourceLimits as ProviderLimits, SandboxPolicy as ProviderPolicy, NetworkPolicy as ProviderNet, MountSpec};
use prost_types::Timestamp;
use std::sync::Arc;
use std::time::Duration;
use tonic::{Request, Response, Status};

pub struct SandboxService {
    provider: Arc<dyn SandboxProvider>,
}

impl SandboxService {
    pub fn new(provider: Arc<dyn SandboxProvider>) -> Self {
        Self { provider }
    }
}

#[tonic::async_trait]
impl Sandboxes for SandboxService {
    async fn create_sandbox(
        &self,
        request: Request<CreateSandboxRequest>,
    ) -> Result<Response<CreateSandboxResponse>, Status> {
        let req = request.into_inner();
        let spec = req.spec.ok_or_else(|| Status::invalid_argument("Missing spec"))?;
        
        // Map protobuf struct to internal provider struct
        let provider_limits = spec.limits.clone().map(|l| ProviderLimits {
            vcpu: l.vcpu,
            memory_mb: l.memory_mb,
            disk_mb: l.disk_mb,
            sandbox_ttl: if l.sandbox_ttl_sec > 0 { Some(Duration::from_secs(l.sandbox_ttl_sec)) } else { None },
            idle_ttl: if l.idle_ttl_sec > 0 { Some(Duration::from_secs(l.idle_ttl_sec)) } else { None },
        }).unwrap_or(ProviderLimits {
            vcpu: 1, memory_mb: 2048, disk_mb: 2048, sandbox_ttl: None, idle_ttl: None,
        });

        let provider_policy = spec.policy.clone().map(|p| ProviderPolicy {
            network: p.network.map(|n| ProviderNet {
                deny_all: n.deny_all,
                allow_domains: n.allow_domains,
                allow_cidrs: n.allow_cidrs,
            }).unwrap_or(ProviderNet { deny_all: false, allow_domains: vec![], allow_cidrs: vec![] }),
            mounts: p.mounts.map(|m| m.mounts.into_iter().map(|mnt| MountSpec {
                host_path: mnt.host_path.into(),
                guest_path: mnt.guest_path.into(),
                read_only: mnt.read_only,
            }).collect()).unwrap_or_default(),
            enable_gpu: p.enable_gpu,
            enable_snapshotting: p.enable_snapshotting,
        }).unwrap_or(ProviderPolicy {
            network: ProviderNet { deny_all: false, allow_domains: vec![], allow_cidrs: vec![] },
            mounts: vec![],
            enable_gpu: false,
            enable_snapshotting: false,
        });

        let provider_spec = ProviderSandboxSpec {
            base_image: spec.base_image.clone(),
            working_dir: spec.working_dir.clone().into(),
            limits: provider_limits,
            policy: provider_policy,
        };

        // Hand off to the provider to actually execute
        let sandbox_id = self.provider.create_sandbox(provider_spec).await
            .map_err(|e| Status::internal(format!("Failed to create sandbox: {}", e)))?;

        // Construct the generated output sandbox representation
        let sandbox = Sandbox {
            sandbox_id,
            provider: ProviderType::ProviderLocalLima as i32,
            state: SandboxState::SandboxReady as i32,
            spec: Some(spec),
            created_at: Some(Timestamp::date_time_nanos(2026, 1, 1, 0, 0, 0, 0).unwrap()),
            updated_at: Some(Timestamp::date_time_nanos(2026, 1, 1, 0, 0, 0, 0).unwrap()),
            last_error: String::new(),
            usage: None,
        };

        Ok(Response::new(CreateSandboxResponse {
            sandbox: Some(sandbox),
        }))
    }

    async fn get_sandbox(
        &self,
        _request: Request<GetSandboxRequest>,
    ) -> Result<Response<Sandbox>, Status> {
        Err(Status::unimplemented("Not yet implemented"))
    }

    async fn list_sandboxes(
        &self,
        _request: Request<ListSandboxesRequest>,
    ) -> Result<Response<ListSandboxesResponse>, Status> {
        let sandboxes_data = self.provider.list_sandboxes().await
            .map_err(|e| Status::internal(format!("Failed to list sandboxes: {}", e)))?;

        let mut sandboxes = Vec::new();
        for (id, spec) in sandboxes_data {
            // Note: In a complete implementation, we'd persist the proto `SandboxSpec` somewhere.
            // For now, reconstruct a generic representation back from the provider spec.
            let proto_spec = crate::pb::SandboxSpec {
                base_image: spec.base_image,
                working_dir: spec.working_dir.display().to_string(),
                provider: ProviderType::ProviderLocalLima as i32,
                labels: None,
                limits: None,
                policy: None,
                allow_pool_reuse: false,
                init_cmd: vec![],
            };

            sandboxes.push(Sandbox {
                sandbox_id: id,
                provider: ProviderType::ProviderLocalLima as i32,
                state: SandboxState::SandboxReady as i32,
                spec: Some(proto_spec),
                created_at: Some(Timestamp::date_time_nanos(2026, 1, 1, 0, 0, 0, 0).unwrap()),
                updated_at: Some(Timestamp::date_time_nanos(2026, 1, 1, 0, 0, 0, 0).unwrap()),
                last_error: String::new(),
                usage: None,
            });
        }

        Ok(Response::new(ListSandboxesResponse { sandboxes, page: None }))
    }

    async fn stop_sandbox(
        &self,
        request: Request<StopSandboxRequest>,
    ) -> Result<Response<Sandbox>, Status> {
        let req = request.into_inner();
        self.provider.stop_sandbox(&req.sandbox_id, req.force).await
             .map_err(|e| Status::internal(format!("Stop failed: {}", e)))?;
        Err(Status::unimplemented("Mock implementation"))
    }

    async fn destroy_sandbox(
        &self,
        request: Request<DestroySandboxRequest>,
    ) -> Result<Response<DestroySandboxResponse>, Status> {
        let req = request.into_inner();
        self.provider.destroy_sandbox(&req.sandbox_id, req.force).await
             .map_err(|e| Status::internal(format!("Destroy failed: {}", e)))?;
        Ok(Response::new(DestroySandboxResponse {
            sandbox_id: req.sandbox_id,
        }))
    }

    type WatchSandboxStream = tonic::Streaming<Sandbox>;

    async fn watch_sandbox(
        &self,
        _request: Request<WatchSandboxRequest>,
    ) -> Result<Response<Self::WatchSandboxStream>, Status> {
         Err(Status::unimplemented("Not yet implemented"))
    }
}
