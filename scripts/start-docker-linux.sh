#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common-linux.sh"

SKIP_BUILD='false'
if [[ "${1:-}" == '--skip-build' ]]; then
  SKIP_BUILD='true'
fi

# Linux 全量 Docker 启动入口。
start_full_docker_stack "${SKIP_BUILD}"
