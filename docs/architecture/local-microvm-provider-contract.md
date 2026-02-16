# Local MicroVM Provider Contract

Crucible supports `sandbox_provider = local_microvm` via a controller command.

Default command now uses the bundled wrapper:
`node scripts/microvmctl.js`

This makes macOS/Windows/Linux use the same app-level integration while letting you choose transport:
- Linux: direct local backend command
- macOS (Apple Silicon): host-local worker VM via `limactl shell crucible-worker -- microvmctl`
- Windows/macOS fallback: SSH forwarding to a Linux microVM host

## Why This Exists
The app server does not directly boot microVMs yet. Instead, it delegates lifecycle and I/O to a host-level controller command so we can:
- keep application code simple
- swap runtimes (Firecracker, Kata, cloud-hypervisor based wrappers)
- preserve one execution workflow path

## Environment Variables
- `SANDBOX_PROVIDER`: default provider preference (`auto`, `remote_e2b`, `local_microvm`)
- `LOCAL_MICROVM_CLI`: optional full command override (example: `node scripts/microvmctl.js` or `/usr/local/bin/microvmctl`)
- `LOCAL_MICROVM_FALLBACK_TO_REMOTE`: when not `false`, fallback to `remote_e2b` if local create fails

Wrapper transport selection:
- `LOCAL_MICROVM_TRANSPORT=local|ssh|hyperv` (optional)
- If unset: wrapper auto-picks `ssh` when `LOCAL_MICROVM_SSH_HOST` is set, else tries local backend.

Local backend config:
- `LOCAL_MICROVM_BACKEND_CLI` (default: Linux `microvmctl`, macOS `limactl shell crucible-worker -- microvmctl`)

Windows Hyper-V config:
- `LOCAL_MICROVM_HYPERV_CLI` (default: `hyperv-microvmctl`)

SSH transport config:
- `LOCAL_MICROVM_SSH_HOST` (required for ssh mode)
- `LOCAL_MICROVM_SSH_USER` (optional)
- `LOCAL_MICROVM_SSH_PORT` (optional)
- `LOCAL_MICROVM_SSH_KEY_PATH` (optional)
- `LOCAL_MICROVM_SSH_STRICT_HOST_KEY_CHECKING` (`false` to disable strict checking)
- `LOCAL_MICROVM_REMOTE_CLI` (default: `microvmctl` on remote Linux host)

## CLI Contract (Backend/Remote)
The backend command (local or remote) must support these subcommands:

1. Create VM
```bash
microvmctl create --id <vm_id> --ttl-ms <timeout_ms>
```

2. Execute command in VM
```bash
microvmctl exec --id <vm_id> --timeout-ms <ms> -- sh -lc "<command>"
```

3. Write file from stdin
```bash
microvmctl write --id <vm_id> --path /home/user/file.txt
# bytes on stdin
```

4. Read file as base64 on stdout
```bash
microvmctl read --id <vm_id> --path /home/user/file.txt --base64
```

5. List files as JSON
```bash
microvmctl list --id <vm_id> --path /home/user/ --json
```

Expected JSON format (array or object with `entries`):
```json
[
  { "name": "output.csv", "path": "/home/user/output.csv", "type": "file", "size": 1024 },
  { "name": "tmp", "path": "/home/user/tmp", "type": "dir" }
]
```

6. Kill VM
```bash
microvmctl kill --id <vm_id>
```

## Notes
- `auto` is the recommended default for smooth UX: prefer local microVM when ready, else remote E2B.
- If `sandbox_provider` is `local_microvm` and create fails, Crucible falls back to `remote_e2b` by default.
- To enforce strict local-only execution, set `LOCAL_MICROVM_FALLBACK_TO_REMOTE=false`.
- Per-user strict mode is available via Settings (`strict_no_fallback`).
- The bundled wrapper also supports a probe command:
  - `node scripts/microvmctl.js probe`
- Guided setup steps are exposed via:
  - `GET /api/sandbox/setup`
