#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required." >&2
  exit 1
fi

echo "[forge-demo] probing local_microvm runtime..."
npm run -s microvm:probe

SANDBOX_ID="forge-demo-$(date +%s)"

cleanup() {
  node scripts/microvmctl.js kill --id "${SANDBOX_ID}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "[forge-demo] creating sandbox: ${SANDBOX_ID}"
node scripts/microvmctl.js create --id "${SANDBOX_ID}" --ttl-ms 180000

echo "[forge-demo] writing demo program..."
cat <<'PY' | node scripts/microvmctl.js write --id "${SANDBOX_ID}" --path /home/user/demo.py
import json
from statistics import mean

prices = [188.1, 189.4, 190.8, 191.2, 192.9, 193.1]
three_day_avg = [round(mean(prices[i:i+3]), 2) for i in range(len(prices) - 2)]

payload = {
    "series": prices,
    "moving_avg_3": three_day_avg,
    "message": "Forge local microVM demo completed",
}

with open("/home/user/demo-output.json", "w", encoding="utf-8") as f:
    json.dump(payload, f, indent=2)

print(payload["message"])
PY

echo "[forge-demo] executing python in sandbox..."
node scripts/microvmctl.js exec --id "${SANDBOX_ID}" --timeout-ms 60000 -- sh -lc "python3 /home/user/demo.py"

echo "[forge-demo] listing generated files..."
node scripts/microvmctl.js list --id "${SANDBOX_ID}" --path /home/user --json

echo "[forge-demo] reading output artifact..."
RESULT_B64="$(node scripts/microvmctl.js read --id "${SANDBOX_ID}" --path /home/user/demo-output.json --base64)"
node -e "process.stdout.write(Buffer.from(process.argv[1], 'base64').toString('utf8') + '\n')" "${RESULT_B64}"

echo "[forge-demo] success"
