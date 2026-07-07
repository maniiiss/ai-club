#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common-linux.sh"

TARGET="${1:-all}"

case "${TARGET}" in
  docs|backend|frontend|frontend-public|code-processing|all)
    ;;
  *)
    printf '未知 harness 目标：%s\n' "${TARGET}" >&2
    printf '可用目标：docs, backend, frontend, frontend-public, code-processing, all\n' >&2
    exit 1
    ;;
esac

run_step() {
  local name="$1"
  shift
  log "${name}"
  "$@"
  ok "${name}"
}

run_encoding_check() {
  # Harness 统一入口先跑编码检查，避免 UTF-8、LF 或中文乱码问题扩散到后续步骤。
  local targets=()
  case "${TARGET}" in
    docs)
      targets=('AGENTS.md' 'README.md' 'docs' 'scripts')
      ;;
    backend)
      targets=('backend')
      ;;
    frontend)
      targets=('frontend')
      ;;
    frontend-public)
      targets=('frontend-public')
      ;;
    code-processing)
      targets=('code-processing')
      ;;
    all)
      targets=()
      ;;
  esac

  if [[ "${#targets[@]}" -gt 0 ]]; then
    run_step '检查仓库编码与疑似乱码' python3 "${REPO_ROOT}/scripts/check_encoding.py" "${targets[@]}"
  else
    run_step '检查仓库编码与疑似乱码' python3 "${REPO_ROOT}/scripts/check_encoding.py"
  fi
}

run_backend_tests() {
  (
    cd "${BACKEND_DIR}"
    run_step '运行后端 Maven 测试' mvn -s maven-settings-central.xml test
  )
}

run_frontend_build() {
  (
    cd "${FRONTEND_DIR}"
    run_step '运行管理端前端类型检查与构建' npm run build
  )
}

run_frontend_public_build() {
  (
    cd "${FRONTEND_PUBLIC_DIR}"
    run_step '运行公众端前端类型检查与构建' npm run build
  )
}

run_frontend_public_tests() {
  (
    cd "${FRONTEND_PUBLIC_DIR}"
    run_step '运行公众端前端单元与 UI Harness 测试' npm run test
  )
}

run_code_processing_install_check() {
  (
    cd "${CODE_DIR}"
    run_step '检查 code-processing Python 包可安装' python3 -m pip install -e .
  )
}

print_architecture_doc_reminder() {
  warn '如果本次改动涉及技术架构调整、跨模块边界变化或大型技术设计，请同步更新 docs/architecture.md 或新增 docs/design-docs/*-architecture-vN.md / docs/design-docs/*-technical-design-vN.md；模板见 docs/design-docs/architecture-design-template.md。'
}

run_encoding_check
print_architecture_doc_reminder

if [[ "${TARGET}" == 'backend' || "${TARGET}" == 'all' ]]; then
  run_backend_tests
fi

if [[ "${TARGET}" == 'frontend' || "${TARGET}" == 'all' ]]; then
  run_frontend_build
fi

if [[ "${TARGET}" == 'frontend-public' || "${TARGET}" == 'all' ]]; then
  run_frontend_public_tests
  run_frontend_public_build
fi

if [[ "${TARGET}" == 'code-processing' || "${TARGET}" == 'all' ]]; then
  run_code_processing_install_check
fi

ok "Harness 验证完成：${TARGET}"
