#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This installer is intended for macOS." >&2
  exit 1
fi

ARCH="$(uname -m)"
if [[ "${ARCH}" != "arm64" ]]; then
  echo "Apple Silicon (arm64) is recommended for this local worker path." >&2
  echo "Intel macOS should prefer remote_e2b or SSH Linux worker." >&2
fi

if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew not found. Install Homebrew first: https://brew.sh" >&2
  exit 1
fi

INSTANCE_NAME="${LOCAL_MICROVM_LIMA_INSTANCE:-crucible-worker}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKER_SCRIPT="${SCRIPT_DIR}/microvmctl-worker.sh"

if [[ ! -f "${WORKER_SCRIPT}" ]]; then
  echo "Missing worker controller script: ${WORKER_SCRIPT}" >&2
  exit 1
fi

echo "Installing Lima (local VM manager)..."
brew install lima

if ! command -v limactl >/dev/null 2>&1; then
  echo "limactl not found after installation." >&2
  exit 1
fi

echo "Ensuring local worker VM '${INSTANCE_NAME}' exists..."
if limactl list --json 2>/dev/null | grep -q "\"name\":\"${INSTANCE_NAME}\""; then
  if ! limactl start "${INSTANCE_NAME}" >/dev/null 2>&1; then
    limactl shell "${INSTANCE_NAME}" -- true >/dev/null
  fi
else
  limactl start --name="${INSTANCE_NAME}" --yes template://ubuntu >/dev/null
fi

echo "Installing runtime dependencies inside '${INSTANCE_NAME}'..."
limactl shell "${INSTANCE_NAME}" -- bash -lc \
  "sudo apt-get update -y >/dev/null && sudo apt-get install -y python3 python3-pip python3-venv nodejs npm coreutils >/dev/null"

echo "Installing microvmctl compatibility controller inside '${INSTANCE_NAME}'..."
cat "${WORKER_SCRIPT}" | limactl shell "${INSTANCE_NAME}" -- sudo tee /usr/local/bin/microvmctl >/dev/null
limactl shell "${INSTANCE_NAME}" -- sudo chmod +x /usr/local/bin/microvmctl

echo "Running smoke test..."
limactl shell "${INSTANCE_NAME}" -- microvmctl probe >/dev/null
limactl shell "${INSTANCE_NAME}" -- microvmctl create --id crucible-smoke --ttl-ms 5000
limactl shell "${INSTANCE_NAME}" -- microvmctl exec --id crucible-smoke --timeout-ms 5000 -- sh -lc 'echo ok >/home/user/probe.txt'
limactl shell "${INSTANCE_NAME}" -- microvmctl read --id crucible-smoke --path /home/user/probe.txt --base64 >/dev/null
limactl shell "${INSTANCE_NAME}" -- microvmctl kill --id crucible-smoke

echo ""
echo "Local worker VM is ready. Configure your environment:"
echo "  SANDBOX_PROVIDER=local_microvm"
echo "  LOCAL_MICROVM_TRANSPORT=local"
echo "  LOCAL_MICROVM_BACKEND_CLI=limactl shell ${INSTANCE_NAME} -- microvmctl"
echo "  LOCAL_MICROVM_FALLBACK_TO_REMOTE=false"
echo ""
echo "Optional (safer rollout):"
echo "  SANDBOX_PROVIDER=auto"
echo "  LOCAL_MICROVM_FALLBACK_TO_REMOTE=true"
echo ""
echo "Then restart Crucible and run: npm run microvm:probe"
