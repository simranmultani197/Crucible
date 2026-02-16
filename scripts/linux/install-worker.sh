#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "This installer is intended for Linux hosts." >&2
  exit 1
fi

if ! command -v microvmctl >/dev/null 2>&1; then
  echo "microvmctl command not found in PATH." >&2
  echo "Install your microVM backend first, then rerun this script." >&2
  exit 1
fi

SERVICE_NAME="crucible-microvm-worker.service"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}"
SERVICE_CMD="${CRUCIBLE_MICROVM_SERVICE_CMD:-$(command -v microvmctl) health --watch}"

echo "Installing ${SERVICE_NAME} using command: ${SERVICE_CMD}"

sudo tee "${SERVICE_FILE}" >/dev/null <<EOF
[Unit]
Description=Crucible MicroVM Worker
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/env bash -lc '${SERVICE_CMD}'
Restart=always
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now "${SERVICE_NAME}" || true

echo "Linux worker setup completed."
echo "Run: npm run microvm:probe"
