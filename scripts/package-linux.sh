#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common-linux.sh"

OUTPUT_ROOT='dist/docker-package'
SKIP_IMAGE_EXPORT='false'

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-image-export)
      SKIP_IMAGE_EXPORT='true'
      shift
      ;;
    --output-root)
      OUTPUT_ROOT="${2:-}"
      shift 2
      ;;
    *)
      printf '未知参数：%s\n' "$1" >&2
      exit 1
      ;;
  esac
done

# Linux Docker 打包入口。
package_full_docker_stack "${OUTPUT_ROOT}" "${SKIP_IMAGE_EXPORT}"
