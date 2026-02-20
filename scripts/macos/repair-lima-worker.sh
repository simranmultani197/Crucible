#!/usr/bin/env bash
set -euo pipefail

# Repair a broken Lima worker VM: stop, delete, and reinstall.
# Run this when probe fails with "connection reset by peer" even after retries.

INSTANCE_NAME="${LOCAL_MICROVM_LIMA_INSTANCE:-crucible-worker}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_SCRIPT="${SCRIPT_DIR}/install-krunvm-worker.sh"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This repair script is for macOS only." >&2
  exit 1
fi

if ! command -v limactl >/dev/null 2>&1; then
  echo "limactl not found. Run: brew install lima" >&2
  exit 1
fi

echo "Repairing local microVM worker (${INSTANCE_NAME})..."
echo "  Stopping instance..."
limactl stop "${INSTANCE_NAME}" 2>/dev/null || true

echo "  Deleting instance..."
limactl delete "${INSTANCE_NAME}" --force 2>/dev/null || true

echo "  Reinstalling..."
exec bash "${INSTALL_SCRIPT}"
