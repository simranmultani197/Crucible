use crate::pb::execution_server::Execution;
use crate::pb::{
    CancelExecRequest, ExecRequest, ExecResult, ExecStreamResponse, FollowOutputRequest, GetExecRequest,
    ListExecsRequest, ListExecsResponse, OutputChunk, ExecState
};
use crate::provider::{SandboxProvider, ExecSpec as ProviderExecSpec};
use std::sync::Arc;
use std::time::Duration;
use tonic::{Request, Response, Status};

pub struct ExecutionService {
    provider: Arc<dyn SandboxProvider>,
}

impl ExecutionService {
    pub fn new(provider: Arc<dyn SandboxProvider>) -> Self {
        Self { provider }
    }
}

#[tonic::async_trait]
impl Execution for ExecutionService {
    async fn exec(
        &self,
        request: Request<ExecRequest>,
    ) -> Result<Response<ExecResult>, Status> {
        let req = request.into_inner();
        let spec = req.spec.ok_or_else(|| Status::invalid_argument("Missing exec spec"))?;

        let provider_spec = ProviderExecSpec {
            argv: spec.argv,
            env: spec.env.into_iter().collect(),
            cwd: if spec.cwd.is_empty() { None } else { Some(spec.cwd.into()) },
            timeout: Duration::from_millis(spec.timeout_ms.max(1)),
        };

        let result = self.provider.exec(&spec.sandbox_id, provider_spec).await
            .map_err(|e| Status::internal(format!("Exec failed: {}", e)))?;

        Ok(Response::new(ExecResult {
            exec_id: result.exec_id,
            sandbox_id: spec.sandbox_id,
            state: ExecState::ExecSucceeded as i32,
            exit_code: result.exit_code,
            started_at: None,
            finished_at: None,
            output_artifact_ids: vec![],
            stdout_preview: String::new(),
            stderr_preview: String::new(),
            violations: vec![],
        }))
    }

    type ExecStreamStream = tonic::Streaming<ExecStreamResponse>;

    async fn exec_stream(
        &self,
        _request: Request<ExecRequest>,
    ) -> Result<Response<Self::ExecStreamStream>, Status> {
         Err(Status::unimplemented("Not yet implemented"))
    }

    async fn cancel_exec(
        &self,
        _request: Request<CancelExecRequest>,
    ) -> Result<Response<ExecResult>, Status> {
        Err(Status::unimplemented("Not yet implemented"))
    }

    async fn get_exec(
        &self,
        _request: Request<GetExecRequest>,
    ) -> Result<Response<ExecResult>, Status> {
        Err(Status::unimplemented("Not yet implemented"))
    }

    async fn list_execs(
        &self,
        _request: Request<ListExecsRequest>,
    ) -> Result<Response<ListExecsResponse>, Status> {
       Err(Status::unimplemented("Not yet implemented"))
    }

    type FollowOutputStream = tonic::Streaming<OutputChunk>;

    async fn follow_output(
        &self,
        _request: Request<FollowOutputRequest>,
    ) -> Result<Response<Self::FollowOutputStream>, Status> {
         Err(Status::unimplemented("Not yet implemented"))
    }
}
