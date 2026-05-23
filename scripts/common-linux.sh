#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOG_DIR="${REPO_ROOT}/.run-logs"
FRONTEND_DIR="${REPO_ROOT}/frontend"
BACKEND_DIR="${REPO_ROOT}/backend"
CODE_DIR="${REPO_ROOT}/code-processing"
CODE_VENV_DIR="${CODE_DIR}/.venv"
CODE_VENV_PY="${CODE_VENV_DIR}/bin/python"
DEFAULT_ENV_FILE="${REPO_ROOT}/.env"
DEFAULT_ENV_EXAMPLE_FILE="${REPO_ROOT}/.env.example"
FULL_DOCKER_ENV_FILE="${REPO_ROOT}/.env.server"
FULL_DOCKER_ENV_EXAMPLE_FILE="${REPO_ROOT}/.env.server.example"
HYBRID_COMPOSE_FILE="${REPO_ROOT}/docker-compose.yml"
FULL_DOCKER_COMPOSE_FILE="${REPO_ROOT}/docker-compose.server.yml"
DOCKER_DIR="${REPO_ROOT}/docker"
POSTGRES_INIT_DIR="${REPO_ROOT}/docker/postgres/init"
COMPOSE_PROJECT_NAME="$(basename "${REPO_ROOT}")"

log() {
  printf '==> %s\n' "$1"
}

ok() {
  printf '[OK] %s\n' "$1"
}

warn() {
  printf '[WARN] %s\n' "$1"
}

skip() {
  printf '[SKIP] %s\n' "$1"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf '未找到命令 [%s]，请先安装：%s\n' "$1" "$2" >&2
    exit 1
  fi
}

ensure_log_dir() {
  mkdir -p "${LOG_DIR}"
}

ensure_env_file() {
  local target_path="$1"
  local template_path="$2"
  local description="$3"

  if [[ -f "${target_path}" ]]; then
    return 0
  fi

  if [[ ! -f "${template_path}" ]]; then
    printf '找不到 %s 模板文件：%s\n' "${description}" "${template_path}" >&2
    exit 1
  fi

  log "初始化 ${description} 环境文件"
  cp "${template_path}" "${target_path}"
  ok "已创建 ${target_path}"
}

import_dotenv() {
  local env_path="$1"
  [[ -f "${env_path}" ]] || return 0

  log "加载环境变量：$(basename "${env_path}")"
  while IFS= read -r raw_line || [[ -n "${raw_line}" ]]; do
    local line="${raw_line%$'\r'}"
    [[ -z "${line}" || "${line}" == \#* ]] && continue
    [[ "${line}" == *=* ]] || continue

    local key="${line%%=*}"
    local value="${line#*=}"
    export "${key}=${value}"
  done < "${env_path}"
}

get_env_or_default() {
  local name="$1"
  local default_value="$2"
  local value="${!name:-}"
  if [[ -z "${value}" ]]; then
    printf '%s' "${default_value}"
  else
    printf '%s' "${value}"
  fi
}

is_env_flag_enabled() {
  local name="$1"
  local default_value="${2:-false}"
  local value
  value="$(get_env_or_default "${name}" "${default_value}")"
  case "${value,,}" in
    1|true|yes|on) return 0 ;;
    *) return 1 ;;
  esac
}

woodpecker_enabled() {
  is_env_flag_enabled 'WOODPECKER_ENABLED' 'true'
}

get_dotenv_value() {
  local env_path="$1"
  local name="$2"
  local default_value="$3"

  if [[ ! -f "${env_path}" ]]; then
    printf '%s' "${default_value}"
    return 0
  fi

  while IFS= read -r raw_line || [[ -n "${raw_line}" ]]; do
    local line="${raw_line%$'\r'}"
    [[ -z "${line}" || "${line}" == \#* ]] && continue
    [[ "${line}" == *=* ]] || continue

    local key="${line%%=*}"
    local value="${line#*=}"
    if [[ "${key}" == "${name}" ]]; then
      printf '%s' "${value}"
      return 0
    fi
  done < "${env_path}"

  printf '%s' "${default_value}"
}

set_dotenv_value() {
  local env_path="$1"
  local key="$2"
  local value="$3"
  local temp_path="${env_path}.tmp"
  local matched=0

  rm -f "${temp_path}"

  if [[ -f "${env_path}" ]]; then
    while IFS= read -r raw_line || [[ -n "${raw_line}" ]]; do
      local line="${raw_line%$'\r'}"
      if [[ "${line}" == "${key}="* ]]; then
        printf '%s=%s\n' "${key}" "${value}" >> "${temp_path}"
        matched=1
      else
        printf '%s\n' "${line}" >> "${temp_path}"
      fi
    done < "${env_path}"
  fi

  if [[ "${matched}" -eq 0 ]]; then
    printf '%s=%s\n' "${key}" "${value}" >> "${temp_path}"
  fi

  mv "${temp_path}" "${env_path}"
}

ensure_full_docker_env_file() {
  if [[ ! -f "${FULL_DOCKER_ENV_FILE}" ]]; then
    if [[ -f "${DEFAULT_ENV_FILE}" ]]; then
      # 优先复用开发环境中的真实配置，再修正为容器互联所需地址。
      log '根据 .env 初始化 .env.server'
      cp "${DEFAULT_ENV_FILE}" "${FULL_DOCKER_ENV_FILE}"
    else
      ensure_env_file "${FULL_DOCKER_ENV_FILE}" "${FULL_DOCKER_ENV_EXAMPLE_FILE}" '.env.server'
    fi
  fi

  local backend_port
  backend_port="$(get_dotenv_value "${FULL_DOCKER_ENV_FILE}" 'BACKEND_PORT' '8080')"
  set_dotenv_value "${FULL_DOCKER_ENV_FILE}" 'PLATFORM_BACKEND_INTERNAL_BASE_URL' "http://backend:${backend_port}"
  set_dotenv_value "${FULL_DOCKER_ENV_FILE}" 'PLATFORM_INTERNAL_ALLOW_LOCAL_BYPASS' 'false'
  set_dotenv_value "${FULL_DOCKER_ENV_FILE}" 'VITE_API_BASE_URL' ''
  set_dotenv_value "${FULL_DOCKER_ENV_FILE}" 'VITE_API_PORT' "${backend_port}"

  # 补齐全量 Docker 独有的数据目录配置，避免 .env.server 直接从 .env 复制后，
  # 回落到 docker-compose.server.yml 中仅适合 Linux 服务器的 /data/... 默认路径。
  if [[ -z "$(get_dotenv_value "${FULL_DOCKER_ENV_FILE}" 'POSTGRES_DATA_DIR' '')" ]]; then
    set_dotenv_value "${FULL_DOCKER_ENV_FILE}" 'POSTGRES_DATA_DIR' './.data/postgres'
  fi
  if [[ -z "$(get_dotenv_value "${FULL_DOCKER_ENV_FILE}" 'REDIS_DATA_DIR' '')" ]]; then
    set_dotenv_value "${FULL_DOCKER_ENV_FILE}" 'REDIS_DATA_DIR' './.data/redis'
  fi
  if [[ -z "$(get_dotenv_value "${FULL_DOCKER_ENV_FILE}" 'MINIO_DATA_DIR' '')" ]]; then
    set_dotenv_value "${FULL_DOCKER_ENV_FILE}" 'MINIO_DATA_DIR' './.data/minio'
  fi
  if [[ -z "$(get_dotenv_value "${FULL_DOCKER_ENV_FILE}" 'HERMES_PORT' '')" ]]; then
    set_dotenv_value "${FULL_DOCKER_ENV_FILE}" 'HERMES_PORT' '18080'
  fi
  if [[ -z "$(get_dotenv_value "${FULL_DOCKER_ENV_FILE}" 'HERMES_DATA_DIR' '')" ]]; then
    set_dotenv_value "${FULL_DOCKER_ENV_FILE}" 'HERMES_DATA_DIR' './.data/hermes'
  fi
  if [[ -z "$(get_dotenv_value "${FULL_DOCKER_ENV_FILE}" 'HINDSIGHT_PORT' '')" ]]; then
    set_dotenv_value "${FULL_DOCKER_ENV_FILE}" 'HINDSIGHT_PORT' '18888'
  fi
  if [[ -z "$(get_dotenv_value "${FULL_DOCKER_ENV_FILE}" 'HINDSIGHT_CONSOLE_PORT' '')" ]]; then
    set_dotenv_value "${FULL_DOCKER_ENV_FILE}" 'HINDSIGHT_CONSOLE_PORT' '19999'
  fi
  if [[ -z "$(get_dotenv_value "${FULL_DOCKER_ENV_FILE}" 'PLATFORM_SCAN_HOST_PATH' '')" ]]; then
    set_dotenv_value "${FULL_DOCKER_ENV_FILE}" 'PLATFORM_SCAN_HOST_PATH' './.data/scans'
  fi
  if [[ -z "$(get_dotenv_value "${FULL_DOCKER_ENV_FILE}" 'WOODPECKER_PORT' '')" ]]; then
    set_dotenv_value "${FULL_DOCKER_ENV_FILE}" 'WOODPECKER_PORT' '18000'
  fi
  if [[ -z "$(get_dotenv_value "${FULL_DOCKER_ENV_FILE}" 'WOODPECKER_DATA_DIR' '')" ]]; then
    set_dotenv_value "${FULL_DOCKER_ENV_FILE}" 'WOODPECKER_DATA_DIR' './.data/woodpecker'
  fi
  if [[ -z "$(get_dotenv_value "${FULL_DOCKER_ENV_FILE}" 'WOODPECKER_AGENT_DATA_DIR' '')" ]]; then
    set_dotenv_value "${FULL_DOCKER_ENV_FILE}" 'WOODPECKER_AGENT_DATA_DIR' './.data/woodpecker-agent'
  fi
  if [[ -z "$(get_dotenv_value "${FULL_DOCKER_ENV_FILE}" 'PLATFORM_WOODPECKER_INTERNAL_BASE_URL' '')" ]]; then
    set_dotenv_value "${FULL_DOCKER_ENV_FILE}" 'PLATFORM_WOODPECKER_INTERNAL_BASE_URL' 'http://woodpecker-server:8000'
  fi
  if [[ -z "$(get_dotenv_value "${FULL_DOCKER_ENV_FILE}" 'PLATFORM_WOODPECKER_PUBLIC_BASE_URL' '')" ]]; then
    set_dotenv_value "${FULL_DOCKER_ENV_FILE}" 'PLATFORM_WOODPECKER_PUBLIC_BASE_URL' 'http://localhost:18000'
  fi

  ok "已准备全量 Docker 环境文件：${FULL_DOCKER_ENV_FILE}"
}

load_ports() {
  BACKEND_PORT="$(get_env_or_default 'BACKEND_PORT' '8080')"
  FRONTEND_PORT="$(get_env_or_default 'FRONTEND_PORT' '5173')"
  CODE_PROCESSING_PORT="$(get_env_or_default 'CODE_PROCESSING_PORT' '9000')"
  POSTGRES_PORT="$(get_env_or_default 'POSTGRES_PORT' '5432')"
  REDIS_PORT="$(get_env_or_default 'REDIS_PORT' '6379')"
  MINIO_PORT="$(get_env_or_default 'MINIO_PORT' '19000')"
  HERMES_PORT="$(get_env_or_default 'HERMES_PORT' '18080')"
  HINDSIGHT_PORT="$(get_env_or_default 'HINDSIGHT_PORT' '18888')"
  GITNEXUS_UI_PORT="$(get_env_or_default 'PLATFORM_GITNEXUS_UI_PUBLIC_PORT' '5174')"
  WOODPECKER_PORT="$(get_env_or_default 'WOODPECKER_PORT' '18000')"
}

ensure_compose_cmd() {
  if docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD=(docker compose)
    return 0
  fi

  if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD=(docker-compose)
    return 0
  fi

  printf '未找到 Docker Compose，请先安装 docker compose 或 docker-compose。\n' >&2
  exit 1
}

invoke_compose() {
  local compose_file="$1"
  local env_file="$2"
  local description="$3"
  shift 3

  ensure_compose_cmd
  log "${description}"

  local args=()
  if [[ -n "${env_file}" ]]; then
    args+=(--env-file "${env_file}")
  fi
  if [[ -n "${compose_file}" ]]; then
    args+=(-f "${compose_file}")
  fi

  "${COMPOSE_CMD[@]}" "${args[@]}" "$@"
}

capture_compose_output() {
  local compose_file="$1"
  local env_file="$2"
  shift 2

  ensure_compose_cmd
  local args=()
  if [[ -n "${env_file}" ]]; then
    args+=(--env-file "${env_file}")
  fi
  if [[ -n "${compose_file}" ]]; then
    args+=(-f "${compose_file}")
  fi

  "${COMPOSE_CMD[@]}" "${args[@]}" "$@"
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
  local timeout_seconds="$2"
  local service_name="$3"
  local waited=0
  while (( waited < timeout_seconds )); do
    if is_port_listening "${port}"; then
      ok "${service_name} 已监听端口 ${port}"
      return 0
    fi
    sleep 2
    waited=$((waited + 2))
  done
  printf '%s 启动超时，端口 %s 未就绪。\n' "${service_name}" "${port}" >&2
  exit 1
}

get_listening_process_id_by_port() {
  local port="$1"
  local pid
  pid="$(
    ss -ltnp "( sport = :${port} )" 2>/dev/null |
      awk '
        NR > 1 {
          if (match($0, /pid=[0-9]+/)) {
            print substr($0, RSTART + 4, RLENGTH - 4)
            exit
          }
        }
      '
  )"
  printf '%s' "${pid}"
}

process_matches_patterns() {
  local pid="$1"
  local pattern_string="$2"
  [[ -n "${pattern_string}" ]] || return 1

  local args_text
  local comm_text
  args_text="$(ps -p "${pid}" -o args= 2>/dev/null || true)"
  comm_text="$(ps -p "${pid}" -o comm= 2>/dev/null || true)"
  local target_text="${comm_text} ${args_text}"

  local old_ifs="${IFS}"
  IFS='|'
  read -r -a patterns <<< "${pattern_string}"
  IFS="${old_ifs}"

  local pattern
  for pattern in "${patterns[@]}"; do
    [[ -z "${pattern}" ]] && continue
    if [[ "${target_text}" != *"${pattern}"* ]]; then
      return 1
    fi
  done

  return 0
}

write_pid_file() {
  local name="$1"
  local pid="$2"
  printf '%s\n' "${pid}" > "${LOG_DIR}/${name}.pid"
}

get_managed_service_pid() {
  local name="$1"
  local pid_file="${LOG_DIR}/${name}.pid"
  [[ -f "${pid_file}" ]] || return 1

  local pid
  pid="$(head -n 1 "${pid_file}" | tr -d '[:space:]')"
  [[ -n "${pid}" ]] || return 1
  kill -0 "${pid}" >/dev/null 2>&1 || return 1
  printf '%s' "${pid}"
}

stop_service_by_pid_file() {
  local name="$1"
  local pid_file="${LOG_DIR}/${name}.pid"

  if [[ ! -f "${pid_file}" ]]; then
    skip "未发现 ${name} 的托管进程"
    return 0
  fi

  local pid
  pid="$(head -n 1 "${pid_file}" | tr -d '[:space:]')"
  if [[ -z "${pid}" ]]; then
    rm -f "${pid_file}"
    skip "未发现 ${name} 的托管进程"
    return 0
  fi

  if kill -0 "${pid}" >/dev/null 2>&1; then
    log "停止 ${name}（PID ${pid}）"
    kill "${pid}" >/dev/null 2>&1 || true

    local waited=0
    while kill -0 "${pid}" >/dev/null 2>&1 && (( waited < 10 )); do
      sleep 1
      waited=$((waited + 1))
    done

    if kill -0 "${pid}" >/dev/null 2>&1; then
      kill -9 "${pid}" >/dev/null 2>&1 || true
    fi

    ok "${name} 已停止"
  else
    skip "未发现 ${name} 的托管进程"
  fi

  rm -f "${pid_file}"
}

stop_local_services() {
  stop_service_by_pid_file 'frontend'
  stop_service_by_pid_file 'backend'
  stop_service_by_pid_file 'code-processing'
}

test_code_build_tools() {
  local result
  result="$(
    "${CODE_VENV_PY}" -c "import importlib.util; missing=[name for name in ('pip', 'setuptools', 'wheel') if importlib.util.find_spec(name) is None]; print(','.join(missing))" 2>/dev/null || true
  )"
  [[ -z "${result}" ]]
}

test_python_runtime_deps() {
  local result
  result="$(
    "${CODE_VENV_PY}" -c "import importlib.util; missing=[name for name in ('fastapi', 'uvicorn', 'pydantic', 'httpx') if importlib.util.find_spec(name) is None]; print(','.join(missing))" 2>/dev/null || true
  )"
  [[ -z "${result}" ]]
}

code_venv_uses_system_site_packages() {
  local cfg_path="${CODE_VENV_DIR}/pyvenv.cfg"
  [[ -f "${cfg_path}" ]] || return 1
  grep -Eq '^\s*include-system-site-packages\s*=\s*true\s*$' "${cfg_path}"
}

ensure_code_build_tools() {
  if test_code_build_tools; then
    return 0
  fi

  # 新建 venv 时可能没有完整构建工具，这里统一补齐 pip / setuptools / wheel。
  log '安装 code-processing 构建工具（pip / setuptools / wheel）'
  "${CODE_VENV_PY}" -m ensurepip --upgrade
  "${CODE_VENV_PY}" -m pip install --upgrade setuptools wheel

  if ! test_code_build_tools; then
    printf 'code-processing 构建工具安装后仍不可用，请检查 Python/pip 环境。\n' >&2
    exit 1
  fi
}

ensure_code_venv() {
  local recreate=0

  if [[ ! -x "${CODE_VENV_PY}" ]]; then
    recreate=1
  elif ! "${CODE_VENV_PY}" --version >/dev/null 2>&1; then
    recreate=1
  elif code_venv_uses_system_site_packages; then
    recreate=1
  elif ! "${CODE_VENV_PY}" -c "import setuptools" >/dev/null 2>&1; then
    recreate=1
  fi

  if [[ "${recreate}" -eq 1 ]]; then
    # Linux 上源码模式更适合使用纯隔离 venv，避免系统 Python 的 distutils / pip 污染。
    log '创建或重建 code-processing 虚拟环境'
    rm -rf "${CODE_VENV_DIR}"
    python3 -m venv "${CODE_VENV_DIR}"
  fi

  ensure_code_build_tools

  if ! test_python_runtime_deps; then
    log '安装 code-processing 依赖'
    (
      cd "${CODE_DIR}"
      "${CODE_VENV_PY}" -m pip install --no-build-isolation -e .
    )
  else
    log '安装 code-processing 依赖'
    (
      cd "${CODE_DIR}"
      "${CODE_VENV_PY}" -m pip install --no-build-isolation -e .
    )
  fi
}

get_linux_hybrid_code_processing_host() {
  if [[ -n "${CODE_PROCESSING_IP:-}" ]]; then
    printf '%s' "${CODE_PROCESSING_IP}"
    return 0
  fi

  local gateway_ip=''
  if docker network inspect "${COMPOSE_PROJECT_NAME}_default" >/dev/null 2>&1; then
    gateway_ip="$(
      docker network inspect "${COMPOSE_PROJECT_NAME}_default" --format '{{range .IPAM.Config}}{{.Gateway}}{{end}}' 2>/dev/null || true
    )"
  fi

  if [[ -z "${gateway_ip}" ]]; then
    gateway_ip='host.docker.internal'
  fi

  printf '%s' "${gateway_ip}"
}

start_service_if_needed() {
  local name="$1"
  local port="$2"
  local workdir="$3"
  local pattern_string="$4"
  shift 4

  local pid_file="${LOG_DIR}/${name}.pid"
  if is_port_listening "${port}"; then
    local managed_pid=''
    managed_pid="$(get_managed_service_pid "${name}" 2>/dev/null || true)"
    if [[ -n "${managed_pid}" ]]; then
      ok "${name} 已经在端口 ${port} 运行（PID ${managed_pid}）"
      return 0
    fi

    local existing_pid=''
    existing_pid="$(get_listening_process_id_by_port "${port}")"
    if [[ -n "${existing_pid}" ]] && process_matches_patterns "${existing_pid}" "${pattern_string}"; then
      write_pid_file "${name}" "${existing_pid}"
      ok "${name} 已经在端口 ${port} 运行（识别到现有进程 PID ${existing_pid}）"
      return 0
    fi

    printf '%s 需要监听端口 %s，但该端口已被其他进程占用，请先释放端口后重试。\n' "${name}" "${port}" >&2
    exit 1
  fi

  local stdout="${LOG_DIR}/${name}.out.log"
  local stderr="${LOG_DIR}/${name}.err.log"
  : > "${stdout}"
  : > "${stderr}"

  log "启动 ${name}"
  (
    cd "${workdir}"
    nohup "$@" > "${stdout}" 2> "${stderr}" &
    printf '%s\n' "$!" > "${pid_file}"
  )

  wait_port "${port}" 120 "${name}"
}

start_local_application_services() {
  local install_frontend_dependencies="$1"
  local install_code_dependencies="$2"

  require_cmd mvn 'Apache Maven 3.9+'
  require_cmd npm 'Node.js 与 npm'
  require_cmd python3 'Python 3.10+'
  require_cmd ss 'iproute2 / ss'

  if [[ "${install_frontend_dependencies}" == 'true' || ! -d "${FRONTEND_DIR}/node_modules" ]]; then
    log '安装前端依赖'
    (
      cd "${FRONTEND_DIR}"
      npm install --legacy-peer-deps
    )
  fi

  # 目前无论是否显式要求重装，都执行一次 editable 安装，确保源码依赖和入口脚本保持最新。
  ensure_code_venv

  export SERVER_PORT="${BACKEND_PORT}"
  export PLATFORM_BACKEND_INTERNAL_BASE_URL="http://localhost:${BACKEND_PORT}"
  export PLATFORM_CODE_PROCESSING_BASE_URL="http://localhost:${CODE_PROCESSING_PORT}"
  export VITE_API_PORT="${BACKEND_PORT}"

  start_service_if_needed \
    'code-processing' "${CODE_PROCESSING_PORT}" "${CODE_DIR}" \
    "uvicorn|app.main:app|--port ${CODE_PROCESSING_PORT}" \
    "${CODE_VENV_PY}" -m uvicorn app.main:app --host 0.0.0.0 --port "${CODE_PROCESSING_PORT}"

  start_service_if_needed \
    'backend' "${BACKEND_PORT}" "${BACKEND_DIR}" \
    'AiAgentPlatformApplication' \
    mvn -s maven-settings-central.xml spring-boot:run

  start_service_if_needed \
    'frontend' "${FRONTEND_PORT}" "${FRONTEND_DIR}" \
    "${FRONTEND_DIR}|vite|--port ${FRONTEND_PORT}" \
    npm run dev -- --host 0.0.0.0 --port "${FRONTEND_PORT}" --strictPort

  printf '\n'
  ok '源码服务启动完成'
  printf 'Frontend: http://localhost:%s\n' "${FRONTEND_PORT}"
  printf 'Backend: http://localhost:%s\n' "${BACKEND_PORT}"
  printf 'Code processing: http://localhost:%s\n' "${CODE_PROCESSING_PORT}"
  printf 'Logs: %s\n' "${LOG_DIR}"
}

start_source_stack() {
  local skip_infrastructure="$1"
  local skip_frontend_install="$2"
  local skip_code_dependency_install="$3"

  ensure_log_dir
  ensure_env_file "${DEFAULT_ENV_FILE}" "${DEFAULT_ENV_EXAMPLE_FILE}" '.env'
  import_dotenv "${DEFAULT_ENV_FILE}"
  load_ports

  require_cmd docker 'Docker Engine / Docker Desktop'

  if [[ "${skip_infrastructure}" != 'true' ]]; then
    local profile_args=()
    local infrastructure_services=(postgres redis minio hindsight gitnexus-web hermes)
    if woodpecker_enabled; then
      profile_args+=(--profile woodpecker)
      infrastructure_services+=(woodpecker-server woodpecker-agent)
    fi

    invoke_compose "${HYBRID_COMPOSE_FILE}" "${DEFAULT_ENV_FILE}" '启动源码模式依赖容器（PostgreSQL / Redis / MinIO / Hindsight）' \
      "${profile_args[@]}" up -d "${infrastructure_services[@]}"

    local hybrid_code_processing_host
    hybrid_code_processing_host="$(get_linux_hybrid_code_processing_host)"
    export CODE_PROCESSING_IP="${hybrid_code_processing_host}"

    invoke_compose "${HYBRID_COMPOSE_FILE}" "${DEFAULT_ENV_FILE}" '启动源码模式 Hermes 容器' \
      up -d hermes

    wait_port "${POSTGRES_PORT}" 120 'PostgreSQL'
    wait_port "${REDIS_PORT}" 120 'Redis'
    wait_port "${MINIO_PORT}" 120 'MinIO'
    wait_port "${HINDSIGHT_PORT}" 120 'Hindsight'
    wait_port "${GITNEXUS_UI_PORT}" 120 'GitNexus Web UI'
    wait_port "${HERMES_PORT}" 120 'Hermes'
    if woodpecker_enabled; then
      wait_port "${WOODPECKER_PORT}" 120 'Woodpecker'
    fi
    ok "Hermes 将通过 ${hybrid_code_processing_host} 访问宿主机 code-processing"
  fi

  start_local_application_services \
    "$([[ "${skip_frontend_install}" == 'true' ]] && printf 'false' || printf 'true')" \
    "$([[ "${skip_code_dependency_install}" == 'true' ]] && printf 'false' || printf 'true')"
}

stop_source_stack() {
  ensure_log_dir
  stop_local_services

  local env_file=''
  if [[ -f "${DEFAULT_ENV_FILE}" ]]; then
    env_file="${DEFAULT_ENV_FILE}"
  fi

  invoke_compose "${HYBRID_COMPOSE_FILE}" "${env_file}" '停止源码模式依赖容器' \
    --profile woodpecker stop postgres redis minio hindsight gitnexus-web hermes woodpecker-server woodpecker-agent

  printf '\n'
  ok '源码模式项目已停止'
}

restart_source_stack() {
  ensure_log_dir
  ensure_env_file "${DEFAULT_ENV_FILE}" "${DEFAULT_ENV_EXAMPLE_FILE}" '.env'
  import_dotenv "${DEFAULT_ENV_FILE}"
  load_ports

  stop_local_services
  start_local_application_services 'false' 'false'
}

start_full_docker_stack() {
  local skip_build="$1"
  ensure_log_dir
  require_cmd docker 'Docker Engine / Docker Desktop'
  ensure_full_docker_env_file
  import_dotenv "${FULL_DOCKER_ENV_FILE}"
  load_ports

  local compose_args=()
  if woodpecker_enabled; then
    compose_args+=(--profile woodpecker)
  fi
  compose_args+=(up -d)
  if [[ "${skip_build}" != 'true' ]]; then
    compose_args+=(--build)
  fi
  compose_args+=(--remove-orphans)

  invoke_compose "${FULL_DOCKER_COMPOSE_FILE}" "${FULL_DOCKER_ENV_FILE}" '启动全量 Docker 项目' \
    "${compose_args[@]}"

  wait_port "${POSTGRES_PORT}" 180 'PostgreSQL'
  wait_port "${REDIS_PORT}" 180 'Redis'
  wait_port "${MINIO_PORT}" 180 'MinIO'
  wait_port "${CODE_PROCESSING_PORT}" 180 'Code processing'
  wait_port "${HINDSIGHT_PORT}" 180 'Hindsight'
  wait_port "${HERMES_PORT}" 180 'Hermes'
  wait_port "${GITNEXUS_UI_PORT}" 180 'GitNexus Web UI'
  if woodpecker_enabled; then
    wait_port "${WOODPECKER_PORT}" 180 'Woodpecker'
  fi
  wait_port "${BACKEND_PORT}" 180 'Backend'
  wait_port "${FRONTEND_PORT}" 180 'Frontend'

  printf '\n'
  ok '全量 Docker 项目启动完成'
  printf 'Frontend: http://localhost:%s\n' "${FRONTEND_PORT}"
  printf 'Backend: http://localhost:%s\n' "${BACKEND_PORT}"
  printf 'Code processing: http://localhost:%s\n' "${CODE_PROCESSING_PORT}"
  printf 'Hermes: http://localhost:%s\n' "${HERMES_PORT}"
  printf 'Hindsight: http://localhost:%s\n' "${HINDSIGHT_PORT}"
  printf 'GitNexus Web UI: http://localhost:%s\n' "${GITNEXUS_UI_PORT}"
  if woodpecker_enabled; then
    printf 'Woodpecker: http://localhost:%s\n' "${WOODPECKER_PORT}"
  fi
}

stop_full_docker_stack() {
  local env_file=''
  if [[ -f "${FULL_DOCKER_ENV_FILE}" ]]; then
    env_file="${FULL_DOCKER_ENV_FILE}"
  fi

  invoke_compose "${FULL_DOCKER_COMPOSE_FILE}" "${env_file}" '关闭全量 Docker 项目' \
    down --remove-orphans

  printf '\n'
  ok '全量 Docker 项目已关闭'
}

package_full_docker_stack() {
  local output_root="$1"
  local skip_image_export="$2"

  require_cmd docker 'Docker Engine / Docker Desktop'
  ensure_full_docker_env_file
  import_dotenv "${FULL_DOCKER_ENV_FILE}"
  load_ports

  local compose_profile_args=()
  if woodpecker_enabled; then
    compose_profile_args+=(--profile woodpecker)
  fi

  local timestamp
  timestamp="$(date '+%Y%m%d-%H%M%S')"
  local package_dir="${REPO_ROOT}/${output_root}/${timestamp}"
  local images_tar="${package_dir}/git-ai-club-images.tar"
  local images_list_path="${package_dir}/images.txt"
  local readme_path="${package_dir}/README.txt"

  invoke_compose "${FULL_DOCKER_COMPOSE_FILE}" "${FULL_DOCKER_ENV_FILE}" '构建全量 Docker 业务镜像' \
    "${compose_profile_args[@]}" build --pull

  local middleware_services=(postgres redis minio hindsight hermes)
  if woodpecker_enabled; then
    middleware_services+=(woodpecker-server woodpecker-agent)
  fi

  invoke_compose "${FULL_DOCKER_COMPOSE_FILE}" "${FULL_DOCKER_ENV_FILE}" '拉取全量 Docker 中间件镜像' \
    "${compose_profile_args[@]}" pull "${middleware_services[@]}"

  log "准备 Docker 打包目录：${package_dir}"
  mkdir -p "${package_dir}"
  cp "${FULL_DOCKER_COMPOSE_FILE}" "${package_dir}/docker-compose.yml"
  cp "${FULL_DOCKER_ENV_EXAMPLE_FILE}" "${package_dir}/.env.example"
  cp -R "${DOCKER_DIR}" "${package_dir}/docker"
  cp -R "${POSTGRES_INIT_DIR}" "${package_dir}/postgres-init"

  local images=()
  if mapfile -t images < <(capture_compose_output "${FULL_DOCKER_COMPOSE_FILE}" "${FULL_DOCKER_ENV_FILE}" "${compose_profile_args[@]}" config --images 2>/dev/null); then
    :
  fi

  if [[ "${#images[@]}" -eq 0 ]]; then
    warn '通过 docker compose 解析镜像清单失败，改用兜底列表。'
    images=(
      "$(get_dotenv_value "${FULL_DOCKER_ENV_FILE}" 'BACKEND_IMAGE' 'git-ai-club-backend:latest')"
      "$(get_dotenv_value "${FULL_DOCKER_ENV_FILE}" 'FRONTEND_IMAGE' 'git-ai-club-frontend:latest')"
      "$(get_dotenv_value "${FULL_DOCKER_ENV_FILE}" 'CODE_PROCESSING_IMAGE' 'git-ai-club-code-processing:latest')"
      "$(get_dotenv_value "${FULL_DOCKER_ENV_FILE}" 'POSTGRES_IMAGE' 'postgres:16')"
      "$(get_dotenv_value "${FULL_DOCKER_ENV_FILE}" 'REDIS_IMAGE' 'redis:7-alpine')"
      "$(get_dotenv_value "${FULL_DOCKER_ENV_FILE}" 'MINIO_IMAGE' 'minio/minio:RELEASE.2025-02-28T09-55-16Z')"
      "$(get_dotenv_value "${FULL_DOCKER_ENV_FILE}" 'HERMES_IMAGE' 'ghcr.io/nousresearch/hermes-agent:latest')"
      "$(get_dotenv_value "${FULL_DOCKER_ENV_FILE}" 'HINDSIGHT_IMAGE' 'ghcr.io/vectorize-io/hindsight:latest')"
      "$(get_dotenv_value "${FULL_DOCKER_ENV_FILE}" 'GITNEXUS_WEB_IMAGE' 'git-ai-club-gitnexus-web:latest')"
      "$(get_dotenv_value "${FULL_DOCKER_ENV_FILE}" 'WOODPECKER_IMAGE' 'woodpeckerci/woodpecker-server:v3')"
      "$(get_dotenv_value "${FULL_DOCKER_ENV_FILE}" 'WOODPECKER_AGENT_IMAGE' 'woodpeckerci/woodpecker-agent:v3')"
    )
  fi

  printf '%s\n' "${images[@]}" > "${images_list_path}"

  if [[ "${skip_image_export}" != 'true' ]]; then
    log "导出 Docker 镜像到 ${images_tar}"
    docker save -o "${images_tar}" "${images[@]}"
  else
    warn '已跳过 Docker 镜像导出，仅生成 compose 与说明文件。'
  fi

  cat > "${readme_path}" <<EOF
AI Club Docker 打包说明
======================

1. 将 .env.example 复制为 .env，并按部署环境补齐变量。
2. 如果目录里包含镜像包，请先执行：
   docker load -i git-ai-club-images.tar
3. 启动命令：
   docker compose up -d
4. 停止命令：
   docker compose down

默认访问地址
- Frontend: http://localhost:${FRONTEND_PORT}
- Backend: http://localhost:${BACKEND_PORT}
- Code processing: http://localhost:${CODE_PROCESSING_PORT}
- Hermes: http://localhost:${HERMES_PORT}
- Hindsight: http://localhost:${HINDSIGHT_PORT}
- GitNexus Web UI: http://localhost:${GITNEXUS_UI_PORT}
$(if woodpecker_enabled; then printf -- '- Woodpecker: http://localhost:%s\n' "${WOODPECKER_PORT}"; fi)
- PostgreSQL: localhost:${POSTGRES_PORT}
- Redis: localhost:${REDIS_PORT}
- MinIO: http://localhost:${MINIO_PORT}

镜像清单
$(printf -- '- %s\n' "${images[@]}")
EOF

  printf '\n'
  ok "Docker 打包完成：${package_dir}"
}
