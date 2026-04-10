#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${PROJECT_ROOT}/docker-compose.host.yml"
ENV_FILE="${PROJECT_ROOT}/.env.host"
ENV_EXAMPLE_FILE="${PROJECT_ROOT}/.env.host.example"

cd "${PROJECT_ROOT}"

if [[ ! -f "${ENV_FILE}" ]]; then
  # 首次执行时生成 Host 网络环境变量文件，便于在服务器上快速切换部署模式。
  cp "${ENV_EXAMPLE_FILE}" "${ENV_FILE}"
  echo "已生成环境变量文件：${ENV_FILE}"
fi

if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD=(docker-compose)
else
  echo "未找到 Docker Compose，请先安装 Docker Compose v2 或 docker-compose。"
  exit 1
fi

echo "开始构建 Host 网络部署镜像，Compose 文件：${COMPOSE_FILE}"
"${COMPOSE_CMD[@]}" --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" build --pull
echo "镜像构建完成。"
echo "启动命令：${COMPOSE_CMD[*]} --env-file .env.host -f docker-compose.host.yml up -d"
