#!/usr/bin/env bash
set -euo pipefail

OS_LABEL="macOS"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOG_DIR="${REPO_ROOT}/.run-logs"
FRONTEND_DIR="${REPO_ROOT}/frontend"
BACKEND_DIR="${REPO_ROOT}/backend"
CODE_DIR="${REPO_ROOT}/code-processing"
CODE_VENV_PY="${CODE_DIR}/.venv/bin/python"

log() {
  printf '==> %s\n' "$1"
}

ok() {
  printf '√ %s\n' "$1"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf '未找到命令 [%s]，请先安装：%s\n' "$1" "$2" >&2
    exit 1
  fi
}

is_port_listening() {
  python3 - "$1" <<'PY'
import socket
import sys

port = int(sys.argv[1])
sock = socket.socket()
sock.settimeout(0.5)
try:
    sock.connect(("127.0.0.1", port))
except OSError:
    raise SystemExit(1)
else:
    raise SystemExit(0)
finally:
    sock.close()
PY
}

wait_port() {
  local port="$1"
  local timeout="$2"
  local service="$3"
  local waited=0
  while (( waited < timeout )); do
    if is_port_listening "$port"; then
      ok "${service} 已启动，端口 ${port}"
      return 0
    fi
    sleep 2
    waited=$((waited + 2))
  done
  printf '%s 启动超时，请查看日志目录：%s\n' "$service" "$LOG_DIR" >&2
  exit 1
}

ensure_code_build_tools() {
  # Python 3.12/3.13 新建 venv 时可能没有 setuptools，这里统一补齐可编辑安装依赖的构建工具。
  if "$CODE_VENV_PY" -c "import pip, setuptools.build_meta, wheel" >/dev/null 2>&1; then
    return 0
  fi

  log "安装 code-processing 构建工具"
  "$CODE_VENV_PY" -m ensurepip --upgrade
  "$CODE_VENV_PY" -m pip install --upgrade setuptools wheel

  if ! "$CODE_VENV_PY" -c "import pip, setuptools.build_meta, wheel" >/dev/null 2>&1; then
    printf 'code-processing 构建工具安装失败，请检查 Python/pip 环境\n' >&2
    exit 1
  fi
}

ensure_code_venv() {
  local recreate=0
  if [[ ! -x "$CODE_VENV_PY" ]]; then
    recreate=1
  elif ! "$CODE_VENV_PY" --version >/dev/null 2>&1; then
    recreate=1
  elif ! "$CODE_VENV_PY" -c "import setuptools.build_meta" >/dev/null 2>&1; then
    recreate=1
  fi

  if [[ "$recreate" -eq 1 ]]; then
    log "创建/重建 code-processing Python 虚拟环境"
    rm -rf "${CODE_DIR}/.venv"
    python3 -m venv "${CODE_DIR}/.venv" --system-site-packages
  fi

  ensure_code_build_tools

  log "安装 code-processing 依赖"
  (
    cd "$CODE_DIR"
    "$CODE_VENV_PY" -m pip install --no-build-isolation -e .
  )
}

start_service_if_needed() {
  local name="$1"
  local port="$2"
  local workdir="$3"
  shift 3

  if is_port_listening "$port"; then
    ok "${name} 已在运行，端口 ${port}"
    return 0
  fi

  local stdout="${LOG_DIR}/${name}.out.log"
  local stderr="${LOG_DIR}/${name}.err.log"
  local pidfile="${LOG_DIR}/${name}.pid"

  : > "$stdout"
  : > "$stderr"

  log "启动 ${name}"
  (
    cd "$workdir"
    nohup "$@" >"$stdout" 2>"$stderr" &
    echo $! > "$pidfile"
  )

  wait_port "$port" 90 "$name"
}

mkdir -p "$LOG_DIR"

require_cmd docker "Docker Desktop / Docker Engine"
require_cmd mvn "Apache Maven 3.9+"
require_cmd npm "Node.js 与 npm"
require_cmd python3 "Python 3.10+"

log "在 ${OS_LABEL} 上启动项目"

(
  cd "$REPO_ROOT"
  docker compose up -d postgres redis minio
)

log "安装前端依赖"
(
  cd "$FRONTEND_DIR"
  npm install
)

ensure_code_venv

start_service_if_needed "code-processing" 9000 "$CODE_DIR" \
  "$CODE_VENV_PY" -m uvicorn app.main:app --host 0.0.0.0 --port 9000

start_service_if_needed "backend" 8080 "$BACKEND_DIR" \
  mvn -s maven-settings-central.xml spring-boot:run

start_service_if_needed "frontend" 5173 "$FRONTEND_DIR" \
  npm run dev -- --host 0.0.0.0 --port 5173 --strictPort

printf '\n'
ok "项目启动完成"
printf '前端: http://localhost:5173\n'
printf '后端: http://localhost:8080\n'
printf '代码处理服务: http://localhost:9000/health\n'
printf '日志目录: %s\n' "$LOG_DIR"
