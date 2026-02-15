# Multi-Platform Execution Milestones

## M1: Smooth Default Onboarding (Implemented)
- `auto` backend preference with capability-aware resolution.
- One provider contract for runtime operations (`create/exec/read/write/list/kill`).
- One-click local readiness probe in Settings.
- Guardrails to prevent selecting broken local mode.

Acceptance criteria:
- New users can run tasks without local setup.
- `Auto (Recommended)` is default path.
- Probe status is visible in UI.

## M2: Linux First-Class Local Runtime (Partially Implemented)
- Linux installer script for worker/service bootstrap.
- Local backend transport path.

Acceptance criteria:
- Linux host can run `bash scripts/linux/install-worker.sh`.
- Probe passes when backend is correctly installed.

## M3: macOS Apple Silicon Runtime Path (Partially Implemented)
- macOS install helper now provisions a host-local worker VM (Lima/VZ) and installs a local controller shim.
- Auto fallback to SSH/remote when local backend not ready.

Acceptance criteria:
- macOS users can run one setup command and probe host-local readiness without external SSH infrastructure.
- Auto mode remains functional without local backend.

## M4: Windows Runtime Path (Partially Implemented)
- Hyper-V transport support in wrapper.
- Windows install helper and Hyper-V backend adapter entrypoint.

Acceptance criteria:
- Probe reports Hyper-V backend readiness on Windows.
- Users can point `LOCAL_MICROVM_HYPERV_CLI` to implementation command.

## M5: Security and Governance (Implemented Initial Version)
- Advanced Security Mode (strict no-fallback).
- Optional egress allowlist policy gate.
- Signed run manifest artifacts.
- Run audit export API + settings download action.

Acceptance criteria:
- Strict mode blocks fallback behavior.
- Egress policy blocks disallowed hosts when allowlist configured.
- Run manifest artifacts include checksum/signature metadata.
- Users can export run audit data.

## M6: Enterprise Hardening (Next)
- Host/path egress allowlists at runtime boundary.
- Key management integration for manifest signing.
- Tenant policy packs and policy simulation mode.
- Deterministic replay with pinned environment snapshots.
