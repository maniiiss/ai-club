#!/usr/bin/env bash
# 编译 gitpilot-cli 的 rpc-entry 为 bun 单文件 sidecar，并复制资源到 src-tauri。
#
# 产物：
#   src-tauri/binaries/gitpilot-rpc-<target>.exe   （Tauri externalBin 命名约定）
#   src-tauri/resources/theme/*.json               （sidecar 运行时 fs.readFileSync 读取）
#   src-tauri/resources/export-html/**             （export_html 命令用）
#
# 对应设计文档第 13.1 节 spike 结论：bun --compile 可行，资源需外部分发。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CLI="$ROOT/gitpilot-cli"
DESKTOP="$ROOT/gitpilot-desktop"
BIN="$DESKTOP/src-tauri/binaries"
RES="$DESKTOP/src-tauri/resources"

# 目标三元组（与 Tauri externalBin 命名约定一致）
TARGET="x86_64-pc-windows-msvc"

echo "==> 编译 sidecar (bun --compile, target=bun-windows-x64)"
mkdir -p "$BIN"
bun build "$CLI/src/rpc-entry.ts" \
  --compile \
  --target=bun-windows-x64 \
  --outfile="$BIN/gitpilot-rpc-$TARGET.exe"

echo "==> 复制资源文件"
mkdir -p "$RES/theme" "$RES/export-html/vendor"
cp "$CLI/src/modes/interactive/theme/"*.json "$RES/theme/"
cp "$CLI/src/core/export-html/template."* "$RES/export-html/" 2>/dev/null || true
cp "$CLI/src/core/export-html/vendor/"* "$RES/export-html/vendor/" 2>/dev/null || true

echo "✓ sidecar 构建完成："
echo "    二进制: $BIN/gitpilot-rpc-$TARGET.exe"
echo "    资源:   $RES/"
