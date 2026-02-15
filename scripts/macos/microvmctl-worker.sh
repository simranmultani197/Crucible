#!/usr/bin/env bash
set -euo pipefail

ROOT_BASE="/var/tmp/forge-sandboxes"

usage() {
  cat <<'USAGE'
Usage:
  microvmctl <create|exec|write|read|list|kill|probe> [args]

Supported commands:
  create --id <id> --ttl-ms <ms>
  exec --id <id> --timeout-ms <ms> -- <command...>
  write --id <id> --path <path>    (reads file bytes from stdin)
  read --id <id> --path <path> --base64
  list --id <id> --path <path> --json
  kill --id <id>
  probe
USAGE
}

require_arg() {
  local name="$1"
  local value="${2:-}"
  if [[ -z "${value}" ]]; then
    echo "Missing required argument: ${name}" >&2
    exit 2
  fi
}

ensure_sandbox_paths() {
  local sandbox_id="$1"
  local sandbox_root="${ROOT_BASE}/${sandbox_id}"
  mkdir -p "${sandbox_root}/home/user"
}

map_path() {
  local sandbox_id="$1"
  local raw_path="$2"
  local sandbox_root="${ROOT_BASE}/${sandbox_id}"

  if [[ "${raw_path}" == /home/user* ]]; then
    printf '%s\n' "${sandbox_root}${raw_path}"
    return
  fi

  if [[ "${raw_path}" == /* ]]; then
    printf '%s\n' "${sandbox_root}${raw_path}"
    return
  fi

  printf '%s\n' "${sandbox_root}/home/user/${raw_path}"
}

json_list() {
  local visible_base_path="$1"
  local mapped_path="$2"

  python3 - "$visible_base_path" "$mapped_path" <<'PY'
import json
import os
import pathlib
import sys

visible_base = sys.argv[1].rstrip("/")
base_path = pathlib.Path(sys.argv[2])

if not base_path.exists() or not base_path.is_dir():
    print("[]")
    raise SystemExit(0)

rows = []
for entry in sorted(base_path.iterdir(), key=lambda p: p.name):
    kind = "dir" if entry.is_dir() else "file"
    item_path = f"{visible_base}/{entry.name}" if visible_base else f"/{entry.name}"
    row = {
        "name": entry.name,
        "path": item_path,
        "type": kind,
    }
    if entry.is_file():
        row["size"] = entry.stat().st_size
    rows.append(row)

print(json.dumps(rows))
PY
}

if [[ $# -lt 1 ]]; then
  usage
  exit 1
fi

command="$1"
shift

if [[ "${command}" == "probe" ]]; then
  cat <<'JSON'
{"controller":"forge-local-worker","ready":true}
JSON
  exit 0
fi

if [[ "${command}" == "gc" ]]; then
  # Garbage-collect expired sandbox directories based on created_at + ttl_ms
  now_epoch=$(date +%s)
  removed=0
  for dir in "${ROOT_BASE}"/*/; do
    [[ -d "${dir}" ]] || continue
    created_file="${dir}created_at"
    ttl_file="${dir}ttl_ms"
    [[ -f "${created_file}" ]] || continue
    [[ -f "${ttl_file}" ]] || continue

    created_at_val=$(cat "${created_file}")
    ttl_ms_val=$(cat "${ttl_file}")

    # Convert ISO 8601 created_at to epoch (Linux date -d, macOS date -j)
    created_epoch=$(date -d "${created_at_val}" +%s 2>/dev/null \
      || date -j -f "%Y-%m-%dT%H:%M:%SZ" "${created_at_val}" +%s 2>/dev/null \
      || echo 0)
    [[ "${created_epoch}" -gt 0 ]] || continue

    ttl_seconds=$(( (ttl_ms_val + 999) / 1000 ))
    expires_epoch=$(( created_epoch + ttl_seconds ))

    if [[ "${now_epoch}" -ge "${expires_epoch}" ]]; then
      rm -rf "${dir}"
      removed=$((removed + 1))
    fi
  done
  echo "${removed}"
  exit 0
fi

sandbox_id=""
target_path=""
timeout_ms="0"
ttl_ms="0"
want_json="false"
want_base64="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --id)
      sandbox_id="${2:-}"
      shift 2
      ;;
    --path)
      target_path="${2:-}"
      shift 2
      ;;
    --timeout-ms)
      timeout_ms="${2:-0}"
      shift 2
      ;;
    --ttl-ms)
      ttl_ms="${2:-0}"
      shift 2
      ;;
    --json)
      want_json="true"
      shift
      ;;
    --base64)
      want_base64="true"
      shift
      ;;
    --)
      shift
      break
      ;;
    *)
      break
      ;;
  esac
done

require_arg "--id" "${sandbox_id}"
ensure_sandbox_paths "${sandbox_id}"
sandbox_root="${ROOT_BASE}/${sandbox_id}"
sandbox_home="${sandbox_root}/home/user"

case "${command}" in
  create)
    # TTL value is accepted for contract parity, but lifecycle cleanup is handled by host.
    if [[ "${ttl_ms}" =~ ^[0-9]+$ ]] && [[ "${ttl_ms}" -gt 0 ]]; then
      date -u +"%Y-%m-%dT%H:%M:%SZ" > "${sandbox_root}/created_at"
      printf '%s\n' "${ttl_ms}" > "${sandbox_root}/ttl_ms"
    fi

    # Ensure /home/user -> sandbox_home symlink so hardcoded absolute paths
    # in generated code (e.g. plt.savefig('/home/user/chart.png')) resolve
    # to the correct sandbox directory.
    if [[ ! -e /home/user ]] || [[ "$(readlink -f /home/user 2>/dev/null)" != "${sandbox_home}" ]]; then
      sudo rm -rf /home/user 2>/dev/null || true
      sudo mkdir -p /home
      sudo ln -sfn "${sandbox_home}" /home/user
    fi

    exit 0
    ;;
  exec)
    if [[ $# -lt 1 ]]; then
      echo "exec requires command after --" >&2
      exit 2
    fi

    export HOME="${sandbox_home}"
    export FORGE_SANDBOX_HOME="${sandbox_home}"

    # Ensure /home/user -> sandbox_home symlink so hardcoded absolute paths
    # in generated code (e.g. plt.savefig('/home/user/chart.png')) resolve
    # to the correct sandbox directory.
    if [[ ! -e /home/user ]] || [[ "$(readlink -f /home/user 2>/dev/null)" != "${sandbox_home}" ]]; then
      sudo rm -rf /home/user 2>/dev/null || true
      sudo mkdir -p /home
      sudo ln -sfn "${sandbox_home}" /home/user
    fi

    if [[ "$1" == "sh" ]] && [[ "${2:-}" == "-lc" ]] && [[ $# -ge 3 ]]; then
      cmd_text="$3"
      mapped_text="${cmd_text//\/home\/user/${sandbox_home}}"

      if command -v timeout >/dev/null 2>&1 && [[ "${timeout_ms}" =~ ^[0-9]+$ ]] && [[ "${timeout_ms}" -gt 0 ]]; then
        timeout_seconds=$(( (timeout_ms + 999) / 1000 ))
        if [[ "${timeout_seconds}" -lt 1 ]]; then
          timeout_seconds=1
        fi
        timeout "${timeout_seconds}s" sh -lc "${mapped_text}"
      else
        sh -lc "${mapped_text}"
      fi
      exit $?
    fi

    "$@"
    ;;
  write)
    require_arg "--path" "${target_path}"
    mapped_path="$(map_path "${sandbox_id}" "${target_path}")"
    mkdir -p "$(dirname "${mapped_path}")"
    cat > "${mapped_path}"
    ;;
  read)
    require_arg "--path" "${target_path}"
    mapped_path="$(map_path "${sandbox_id}" "${target_path}")"
    if [[ ! -f "${mapped_path}" ]]; then
      echo "File not found: ${target_path}" >&2
      exit 1
    fi

    if [[ "${want_base64}" == "true" ]]; then
      base64 < "${mapped_path}" | tr -d '\n'
    else
      cat "${mapped_path}"
    fi
    ;;
  list)
    require_arg "--path" "${target_path}"
    mapped_path="$(map_path "${sandbox_id}" "${target_path}")"
    if [[ "${want_json}" == "true" ]]; then
      json_list "${target_path}" "${mapped_path}"
    else
      ls -la "${mapped_path}"
    fi
    ;;
  kill)
    rm -rf "${sandbox_root}"
    ;;
  *)
    echo "Unsupported command: ${command}" >&2
    usage
    exit 2
    ;;
esac
