#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOG_DIR="${REPO_ROOT}/.run-logs"

log() {
  printf '==> %s\n' "$1"
}

ok() {
  printf '[OK] %s\n' "$1"
}

skip() {
  printf '[SKIP] %s\n' "$1"
}

stop_service_by_pid_file() {
  local name="$1"
  local pidfile="${LOG_DIR}/${name}.pid"

  if [[ ! -f "$pidfile" ]]; then
    skip "No PID file for ${name}"
    return 0
  fi

  local pid
  pid="$(head -n 1 "$pidfile" | tr -d '[:space:]')"
  if [[ -z "$pid" ]]; then
    rm -f "$pidfile"
    skip "Empty PID file for ${name}"
    return 0
  fi

  if kill -0 "$pid" >/dev/null 2>&1; then
    log "Stopping ${name} (PID ${pid})"
    kill "$pid" >/dev/null 2>&1 || true

    local waited=0
    while kill -0 "$pid" >/dev/null 2>&1 && (( waited < 10 )); do
      sleep 1
      waited=$((waited + 1))
    done

    if kill -0 "$pid" >/dev/null 2>&1; then
      kill -9 "$pid" >/dev/null 2>&1 || true
    fi

    ok "${name} stopped"
  else
    skip "${name} process not found for PID ${pid}"
  fi

  rm -f "$pidfile"
}

mkdir -p "$LOG_DIR"

stop_service_by_pid_file "frontend"
stop_service_by_pid_file "backend"
stop_service_by_pid_file "code-processing"

log "Stopping infrastructure containers (PostgreSQL / Redis / MinIO)"
(
  cd "$REPO_ROOT"
  docker compose stop postgres redis minio
)

printf '\n'
ok "Project stop completed"
