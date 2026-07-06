#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common-linux.sh"

# 默认不重新 build 镜像，避免每次启动都耗时构建。
# 只有显式指定 --rebuild（或设置环境变量 REBUILD=true）才会重新构建镜像。
# 同时保留 --skip-build 以兼容旧用法（等价于默认行为）。
SKIP_BUILD='true'

for arg in "$@"; do
  case "${arg}" in
    --rebuild)
      SKIP_BUILD='false'
      ;;
    --skip-build)
      SKIP_BUILD='true'
      ;;
    -h|--help)
      cat <<'EOF'
用法：
  bash ./scripts/start-docker-linux.sh              # 启动全量 Docker，复用已有镜像（默认）
  bash ./scripts/start-docker-linux.sh --rebuild    # 启动前重新 build 所有业务镜像
  bash ./scripts/start-docker-linux.sh --skip-build # 显式跳过 build，等价于默认行为
  REBUILD=true bash ./scripts/start-docker-linux.sh # 通过环境变量触发重新构建
EOF
      exit 0
      ;;
    *)
      printf '不支持的参数：%s\n' "${arg}" >&2
      exit 1
      ;;
  esac
done

# 支持通过环境变量 REBUILD=true 触发重新构建，便于 CI / 自动化脚本控制。
if is_env_flag_enabled 'REBUILD' 'false'; then
  SKIP_BUILD='false'
fi

# Linux 全量 Docker 启动入口。
start_full_docker_stack "${SKIP_BUILD}"
