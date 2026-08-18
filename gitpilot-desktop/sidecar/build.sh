#!/usr/bin/env bash
# 编译 gitpilot-cli 的 rpc-entry 为 bun 单文件 sidecar，并复制资源到 src-tauri。
#
# 产物：
#   src-tauri/binaries/gitpilot-rpc-<target>.exe   （Tauri externalBin 命名约定）
#   src-tauri/resources/theme/*.json               （sidecar 运行时 fs.readFileSync 读取）
#   src-tauri/resources/export-html/**             （export_html 命令用）
#   src-tauri/resources/skills/**                  （平台内置 Skill 首次安装用）
#   src-tauri/resources/plannotator.json            （Plannotator 内置阶段规则）
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

echo "==> 编译 sidecar (bun --compile, target=bun-windows-x64-baseline)"
mkdir -p "$BIN"
# Bun 单文件二进制中的 import.meta.url 指向虚拟目录；先对精确锁定的扩展
# 应用资源路径兼容补丁，令其运行时读取 Tauri resources 中的内置配置。
node "$CLI/scripts/prepare-plannotator-package.mjs"
# target 用 baseline：默认 bun-windows-x64 需要 CPU 支持 AVX2，在无 AVX2 的旧
# CPU/虚拟机上会 Illegal instruction 崩溃；baseline 产物兼容更多机器。
bun build "$CLI/src/rpc-entry.ts" \
  --compile \
  --target=bun-windows-x64-baseline \
  --external='@anthropic-ai/claude-agent-sdk' \
  --external='@opencode-ai/sdk' \
  --outfile="$BIN/gitpilot-rpc-$TARGET.exe"

# dev 模式下 resolve_sidecar（main.rs）优先查 src-tauri/target/debug/ 同级目录，
# 需同步新二进制到此，否则 tauri dev 会跑旧 sidecar（曾导致 fork 改动不生效）。
DEBUG_BIN="$DESKTOP/src-tauri/target/debug"
if [ -d "$DEBUG_BIN" ]; then
  if cp "$BIN/gitpilot-rpc-$TARGET.exe" "$DEBUG_BIN/gitpilot-rpc-$TARGET.exe" 2>/dev/null \
    && cp "$BIN/gitpilot-rpc-$TARGET.exe" "$DEBUG_BIN/gitpilot-rpc.exe" 2>/dev/null; then
    echo "    已同步到 target/debug/（dev 模式 resolve_sidecar 命中）"
  else
    echo "    警告：target/debug/ 的 sidecar 被占用（tauri dev 运行中？），未同步。"
    echo "    请停止 tauri dev 后重新运行 build.sh，或手动复制 binaries/gitpilot-rpc-$TARGET.exe 到 target/debug/。"
  fi
fi

echo "==> 复制资源文件到 resources/（dev 期 sidecar cwd 指向此处；tauri bundle 由此打包）"
mkdir -p "$RES/theme" "$RES/export-html/vendor" "$RES/skills"
# Bun 单文件 sidecar 运行时无法再从源码目录读取 package.json；复制 GitPilot
# manifest 让配置目录和品牌名在安装态仍保持 .gitpilot/gitpilot，不回退到上游 .pi。
cp "$CLI/package.json" "$RES/package.json"
cp "$CLI/src/modes/interactive/theme/"*.json "$RES/theme/"
cp "$CLI/src/core/export-html/template."* "$RES/export-html/" 2>/dev/null || true
cp "$CLI/src/core/export-html/vendor/"* "$RES/export-html/vendor/" 2>/dev/null || true
cp "$CLI/node_modules/@plannotator/pi-extension/plannotator.json" "$RES/plannotator.json"
cp -R "$CLI/src/bundled-skills/cross-agent-harness" "$RES/skills/"
cp -R "$CLI/src/bundled-skills/kuaikai-platform" "$RES/skills/"

echo "✓ sidecar 构建完成："
echo "    二进制: $BIN/gitpilot-rpc-$TARGET.exe"
echo "    资源:   $RES/（theme、export-html；dev 期 sidecar cwd 与 tauri bundle 源）"
