# Local MicroVM Quickstart (Cross-Platform)

This setup lets Forge use local microVM where available, while preserving smooth fallback.

## 1) Pick Backend Mode in App Settings
- Open `/settings`
- Recommended: choose **Auto (Recommended)**
- For strict local-only validation: choose **Local MicroVM**

## 2) Configure Environment

### Linux host running Forge directly
Use a local backend command:

```bash
SANDBOX_PROVIDER=auto
LOCAL_MICROVM_TRANSPORT=local
LOCAL_MICROVM_BACKEND_CLI=microvmctl
LOCAL_MICROVM_FALLBACK_TO_REMOTE=true
```

One-command bootstrap:
```bash
bash scripts/linux/install-worker.sh
```

### macOS (Apple Silicon) running Forge - host-local worker VM
Use Lima/VZ local worker VM (no external SSH host):

```bash
SANDBOX_PROVIDER=auto
LOCAL_MICROVM_TRANSPORT=local
LOCAL_MICROVM_BACKEND_CLI="limactl shell forge-worker -- microvmctl"
LOCAL_MICROVM_FALLBACK_TO_REMOTE=true
```

Bootstrap command:
```bash
bash scripts/macos/install-krunvm-worker.sh
```

### macOS/Windows alternative fallback
Use SSH forwarding to a Linux microVM host:

```bash
SANDBOX_PROVIDER=auto
LOCAL_MICROVM_TRANSPORT=ssh
LOCAL_MICROVM_SSH_HOST=your-linux-host
LOCAL_MICROVM_SSH_USER=ubuntu
LOCAL_MICROVM_SSH_PORT=22
LOCAL_MICROVM_SSH_KEY_PATH=~/.ssh/id_ed25519
LOCAL_MICROVM_REMOTE_CLI=/usr/local/bin/microvmctl
LOCAL_MICROVM_FALLBACK_TO_REMOTE=true
```

Windows Hyper-V helper:
```powershell
powershell -ExecutionPolicy Bypass -File scripts/windows/install-hyperv-worker.ps1
```

Notes:
- `LOCAL_MICROVM_CLI` is optional; default is bundled wrapper `node scripts/microvmctl.js`.
- If strict host key behavior blocks first run, set:
  - `LOCAL_MICROVM_SSH_STRICT_HOST_KEY_CHECKING=false`
- For strict local-only testing, set `LOCAL_MICROVM_FALLBACK_TO_REMOTE=false`.

## 3) Probe Before Running Tasks

```bash
node scripts/microvmctl.js probe
# or
npm run microvm:probe
```

Expected:
- JSON output showing transport and configuration.
- Exit code `0` when configuration is valid.

## 4) Validate From App
You can also use **Settings -> Execution Backend -> Test Local MicroVM**.
Use **Settings -> Execution Backend -> Setup Wizard** for OS-aware fix steps.

Run a sandbox task, then verify provider usage:
- `GET /api/sandbox` should show `provider: "local_microvm"` when active
- `messages.metadata.sandbox_provider` should be `local_microvm`
- `tool_calls.provider` for sandbox steps should be `local_microvm`
