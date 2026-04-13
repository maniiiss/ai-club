#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Linux 源码模式停止入口：先停本地源码服务，再停源码模式依赖容器。
source "${SCRIPT_DIR}/common-linux.sh"

stop_source_stack
