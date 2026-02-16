#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

echo "[crucible] quickstart"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Install Node 20 first." >&2
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [[ "${NODE_MAJOR}" -lt 20 || "${NODE_MAJOR}" -ge 25 ]]; then
  echo "Unsupported Node.js version: $(node -v). Use Node 20.x (see .nvmrc)." >&2
  exit 1
fi

if [[ ! -f ".env.local" ]]; then
  cp ".env.example" ".env.local"
  echo "Created .env.local from .env.example."
fi

get_env_value() {
  local name="$1"
  local value
  value="$(grep -E "^${name}=" ".env.local" | head -n1 | sed "s/^${name}=//" || true)"
  echo "${value}"
}

upsert_env() {
  local name="$1"
  local value="$2"
  local tmp_file
  tmp_file="$(mktemp)"

  awk -v key="${name}" -v val="${value}" '
    BEGIN { replaced = 0 }
    {
      if ($0 ~ ("^" key "=")) {
        print key "=" val
        replaced = 1
      } else {
        print $0
      }
    }
    END {
      if (!replaced) {
        print key "=" val
      }
    }
  ' ".env.local" > "${tmp_file}"

  mv "${tmp_file}" ".env.local"
}

ensure_env() {
  local name="$1"
  local prompt="$2"
  local value
  value="$(get_env_value "${name}")"

  if [[ -z "${value}" || "${value}" == "https://your-project-id.supabase.co" || "${value}" == your-* ]]; then
    echo "[crucible] ${name} is missing."
    printf "%s: " "${prompt}"
    read -r value
    if [[ -z "${value}" ]]; then
      echo "No value provided for ${name}." >&2
      exit 1
    fi
    upsert_env "${name}" "${value}"
    echo "[crucible] wrote ${name} to .env.local"
  fi
}

ensure_env "NEXT_PUBLIC_SUPABASE_URL" "Enter Supabase URL (https://<project>.supabase.co)"
ensure_env "NEXT_PUBLIC_SUPABASE_ANON_KEY" "Enter Supabase anon key"

if [[ ! -d "node_modules" ]]; then
  echo "[crucible] installing dependencies..."
  npm install
fi

echo "[crucible] running local runtime probe (non-blocking)..."
if ! npm run -s microvm:probe; then
  echo "[crucible] microvm probe failed. Auto mode can still use remote_e2b."
fi

echo "[crucible] starting dev server at http://localhost:3000"
exec npm run dev:clean
