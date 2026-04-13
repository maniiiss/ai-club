#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Linux 全量 Docker 停止入口。
source "${SCRIPT_DIR}/common-linux.sh"

stop_full_docker_stack
