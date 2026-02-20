#!/usr/bin/env bash
# Run dev server and stop the local Lima VM when it exits (Ctrl+C, etc.)
# Also enables browser-based auto-stop: VM stops ~90s after closing all tabs.
# Use: npm run dev:local

set -e

INSTANCE_NAME="${LOCAL_MICROVM_LIMA_INSTANCE:-crucible-worker}"
export LOCAL_MICROVM_AUTO_STOP_ON_IDLE=1

cleanup() {
  echo ""
  echo "Stopping local microVM (${INSTANCE_NAME})..."
  limactl stop "${INSTANCE_NAME}" 2>/dev/null || true
  exit 0
}

trap cleanup SIGINT SIGTERM EXIT

echo "Starting dev server. Lima VM will auto-stop when you exit (Ctrl+C) or close all browser tabs (~90s)."
npm run dev
