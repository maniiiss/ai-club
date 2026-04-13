#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Linux 源码服务重启入口：仅重启本地源码服务，不重新拉起 Docker 中间件。
source "${SCRIPT_DIR}/common-linux.sh"

restart_source_stack
