#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Linux 全量 Docker 按服务重启入口：支持单独重启 frontend / backend，也支持一起重启。
source "${SCRIPT_DIR}/common-linux.sh"

show_usage() {
  cat <<'EOF'
用法：
  bash ./scripts/restart-docker-linux.sh frontend
  bash ./scripts/restart-docker-linux.sh backend
  bash ./scripts/restart-docker-linux.sh frontend backend
  bash ./scripts/restart-docker-linux.sh all

说明：
  1. 仅重启全量 Docker 中的 frontend / backend 业务容器。
  2. 不会停止 PostgreSQL、Redis、MinIO 等基础设施容器。
EOF
}

if [[ $# -eq 0 ]]; then
  show_usage
  exit 1
fi

declare -A selected_services=()
for raw_target in "$@"; do
  case "${raw_target}" in
    frontend|backend)
      selected_services["${raw_target}"]=1
      ;;
    all)
      selected_services["backend"]=1
      selected_services["frontend"]=1
      ;;
    -h|--help)
      show_usage
      exit 0
      ;;
    *)
      printf '不支持的服务参数：%s\n' "${raw_target}" >&2
      show_usage >&2
      exit 1
      ;;
  esac
done

services=()
if [[ -n "${selected_services[backend]:-}" ]]; then
  services+=(backend)
fi
if [[ -n "${selected_services[frontend]:-}" ]]; then
  services+=(frontend)
fi

ensure_log_dir
require_cmd docker 'Docker Engine / Docker Desktop'
ensure_full_docker_env_file
import_dotenv "${FULL_DOCKER_ENV_FILE}"
load_ports

# 这里直接复用全量 Docker 的 compose 与 env 配置，只重启指定业务容器，避免影响其他中间件。
invoke_compose "${FULL_DOCKER_COMPOSE_FILE}" "${FULL_DOCKER_ENV_FILE}" "重启 Docker 业务容器：${services[*]}" \
  restart "${services[@]}"

# 重启命令成功后，再按服务等待端口恢复监听，避免容器虽然已重启但业务还未就绪。
for service_name in "${services[@]}"; do
  case "${service_name}" in
    backend)
      wait_port "${BACKEND_PORT}" 180 'Backend'
      ;;
    frontend)
      wait_port "${FRONTEND_PORT}" 180 'Frontend'
      ;;
  esac
done

printf '\n'
ok "已完成 Docker 业务容器重启：${services[*]}"
