#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Linux 全量 Docker 按服务重启入口：支持单独重启 frontend / backend，也支持一起重启。
source "${SCRIPT_DIR}/common-linux.sh"

show_usage() {
  cat <<'EOF'
用法：
  bash ./scripts/restart-docker-linux.sh restart frontend
  bash ./scripts/restart-docker-linux.sh restart backend code-processing
  bash ./scripts/restart-docker-linux.sh rebuild frontend
  bash ./scripts/restart-docker-linux.sh rebuild all
  bash ./scripts/restart-docker-linux.sh frontend backend

说明：
  1. `restart` 只重启指定业务容器。
  2. `rebuild` 会重新 build 并重建指定业务容器。
  3. 兼容旧写法：如果省略动作，默认按 `restart` 处理。
  4. 可选服务：frontend / frontend-public / backend / code-processing / all。
  2. 不会停止 PostgreSQL、Redis、MinIO 等基础设施容器。
EOF
}

if [[ $# -eq 0 ]]; then
  show_usage
  exit 1
fi

action='restart'
case "${1:-}" in
  restart|rebuild)
    action="$1"
    shift
    ;;
  -h|--help)
    show_usage
    exit 0
    ;;
esac

if [[ $# -eq 0 ]]; then
  show_usage
  exit 1
fi

declare -A selected_services=()
for raw_target in "$@"; do
  case "${raw_target}" in
    frontend|frontend-public|backend|code-processing)
      selected_services["${raw_target}"]=1
      ;;
    all)
      selected_services["backend"]=1
      selected_services["frontend"]=1
      selected_services["frontend-public"]=1
      selected_services["code-processing"]=1
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
if [[ -n "${selected_services[frontend-public]:-}" ]]; then
  services+=(frontend-public)
fi
if [[ -n "${selected_services[code-processing]:-}" ]]; then
  services+=(code-processing)
fi

ensure_log_dir
require_cmd docker 'Docker Engine / Docker Desktop'
ensure_full_docker_env_file
import_dotenv "${FULL_DOCKER_ENV_FILE}"
load_ports

# 这里直接复用全量 Docker 的 compose 与 env 配置，只操作指定业务容器，避免影响其他中间件。
case "${action}" in
  restart)
    invoke_compose "${FULL_DOCKER_COMPOSE_FILE}" "${FULL_DOCKER_ENV_FILE}" "重启 Docker 业务容器：${services[*]}" \
      restart "${services[@]}"
    ;;
  rebuild)
    # `up -d --build` 会重新构建并按需重建目标容器，是“build + restart”的最小闭环。
    invoke_compose "${FULL_DOCKER_COMPOSE_FILE}" "${FULL_DOCKER_ENV_FILE}" "重建 Docker 业务容器：${services[*]}" \
      up -d --build "${services[@]}"
    ;;
esac

# 容器动作成功后，再按服务等待端口恢复监听，避免 Docker 返回成功但业务还未就绪。
for service_name in "${services[@]}"; do
  case "${service_name}" in
    backend)
      wait_port "${BACKEND_PORT}" 180 'Backend'
      ;;
    frontend)
      wait_port "${FRONTEND_PORT}" 180 'Frontend'
      ;;
    frontend-public)
      wait_port "${FRONTEND_PUBLIC_PORT}" 180 'Frontend public'
      ;;
    code-processing)
      wait_port "${CODE_PROCESSING_PORT}" 180 'Code processing'
      ;;
  esac
done

printf '\n'
if [[ "${action}" == 'rebuild' ]]; then
  ok "已完成 Docker 业务容器重建：${services[*]}"
else
  ok "已完成 Docker 业务容器重启：${services[*]}"
fi
