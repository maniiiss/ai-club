#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Linux 源码模式入口：中间件走 Docker，前后端与 code-processing 走源码进程。
source "${SCRIPT_DIR}/common-linux.sh"

start_source_stack 'false' 'false' 'false'
