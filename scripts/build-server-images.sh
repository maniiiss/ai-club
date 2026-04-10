#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${PROJECT_ROOT}/docker-compose.server.yml"
ENV_FILE="${PROJECT_ROOT}/.env.server"
ENV_EXAMPLE_FILE="${PROJECT_ROOT}/.env.server.example"

cd "${PROJECT_ROOT}"

if [[ ! -f "${ENV_FILE}" ]]; then
  # 首次执行时生成服务器环境变量文件，默认采用同源代理，避免前端改端口后跨域。
  cp "${ENV_EXAMPLE_FILE}" "${ENV_FILE}"
  echo "已生成环境变量文件：${ENV_FILE}"
fi

# 兼容 Docker Compose v2 和旧版 docker-compose，方便不同服务器直接执行。
if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD=(docker-compose)
else
  echo "未找到 Docker Compose，请先安装 Docker Compose v2 或 docker-compose。"
  exit 1
fi

FRONTEND_API_BASE_URL="$(grep -E '^VITE_API_BASE_URL=' "${ENV_FILE}" | tail -n 1 | cut -d '=' -f 2- || true)"

echo "开始打镜像，Compose 文件：${COMPOSE_FILE}"
echo "前端接口地址：${FRONTEND_API_BASE_URL:-同源代理（推荐）}"

"${COMPOSE_CMD[@]}" --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" build --pull

echo "镜像构建完成。"
echo "部署启动命令：${COMPOSE_CMD[*]} --env-file .env.server -f docker-compose.server.yml up -d"
