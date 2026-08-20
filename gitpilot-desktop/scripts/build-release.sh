#!/usr/bin/env bash
# ============================================================
# GitPilot Desktop 一键发布打包脚本（Windows Git Bash / Linux/macOS bash）
#
# 用法：
#   bash scripts/build-release.sh [版本号]
#   - 不带参数时提示输入版本号（semver，如 0.2.0）
#   - 自动把版本同步到 package.json / src-tauri/Cargo.toml / src-tauri/tauri.conf.json
#   - 自动确保 Tauri 签名密钥存在（不存在则生成），并把公钥同步进 tauri.conf.json
#   - 构建 MSI + NSIS 安装器 + updater ZIP + .sig 签名，整理成后台上传六件套
# 产物：gitpilot-desktop/release-artifacts/<版本>/  （含 release-artifacts.json 与说明）
# 环境变量：TAURI_SIGNING_PRIVATE_KEY_PASSWORD（已设置则跳过密码输入）
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

SEMVER_RE='^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$'

step() { echo; echo "=== $1 ==="; }

# ---------- 1. 版本号 ----------
NEW_VERSION="${1:-}"
if [ -z "$NEW_VERSION" ]; then
  CURRENT="$(node -p "require('./package.json').version")"
  read -r -p "请输入发布版本号（当前 ${CURRENT}）：" NEW_VERSION
fi
if ! [[ "$NEW_VERSION" =~ $SEMVER_RE ]]; then
  echo "错误：版本号必须是 semver，例如 0.2.0" >&2
  exit 1
fi

# ---------- 2. 同步三处版本 ----------
step "同步版本号到 package.json / Cargo.toml / tauri.conf.json：$NEW_VERSION"
node -e "
const fs = require('fs');
const p = JSON.parse(fs.readFileSync('package.json', 'utf8'));
p.version = '$NEW_VERSION';
fs.writeFileSync('package.json', JSON.stringify(p, null, 2) + '\n');
const t = fs.readFileSync('src-tauri/tauri.conf.json', 'utf8');
fs.writeFileSync('src-tauri/tauri.conf.json', t.replace(/(\"version\"\s*:\s*)\"[^\"]*\"/, '\$1\"$NEW_VERSION\"'));
"
sed -i.bak "0,/^version = /s/^version = .*/version = \"$NEW_VERSION\"/" src-tauri/Cargo.toml && rm -f src-tauri/Cargo.toml.bak

# ---------- 3. 签名密钥 ----------
step "检查 Tauri 更新签名密钥"
KEY_PATH="${TAURI_SIGNING_KEY_PATH:-$HOME/.tauri/gitpilot.key}"
PUB_PATH="$KEY_PATH.pub"
if [ -f "$KEY_PATH" ]; then
  echo "使用已有私钥：$KEY_PATH"
else
  echo "未找到私钥，正在生成：$KEY_PATH"
  read -s -r -p "为私钥设置一个口令（务必记住，丢失将无法再签更新包）：" PW1; echo
  read -s -r -p "再次输入口令确认：" PW2; echo
  [ "$PW1" != "$PW2" ] && { echo "两次口令不一致" >&2; exit 1; }
  [ -z "$PW1" ] && echo "警告：使用空口令，不建议！"
  ./node_modules/.bin/tauri signer generate -w "$KEY_PATH" -p "$PW1"
  chmod 600 "$KEY_PATH" 2>/dev/null || true
  echo "已生成。私钥：$KEY_PATH（请立即备份到安全位置）"
fi
[ -f "$PUB_PATH" ] || { echo "错误：缺少公钥文件 $PUB_PATH" >&2; exit 1; }
PUBKEY="$(cat "$PUB_PATH")"

# ---------- 4. 同步公钥进 tauri.conf.json ----------
node -e "
const fs = require('fs');
const p = 'src-tauri/tauri.conf.json';
const t = fs.readFileSync(p, 'utf8');
const pub = process.argv[1];
if (!t.includes(pub)) {
  fs.writeFileSync(p, t.replace(/(\"pubkey\"\s*:\s*)\"[^\"]*\"/, '\$1\"' + pub + '\"'));
  console.log('已同步公钥到 tauri.conf.json');
}
" "$PUBKEY"

# ---------- 5. 读取签名口令 ----------
step "构建并签名"
PW="${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}"
if [ -z "$PW" ]; then
  read -s -r -p "请输入签名私钥口令（无口令直接回车）：" PW; echo
fi
if [ "$(node -p "require('./src-tauri/tauri.conf.json').bundle.createUpdaterArtifacts")" != "v1Compatible" ]; then
  echo "错误：tauri.conf.json 的 createUpdaterArtifacts 需为 \"v1Compatible\" 才能产出 ZIP 签名" >&2
  exit 1
fi

export TAURI_SIGNING_PRIVATE_KEY="$(cat "$KEY_PATH")"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="$PW"
npm run tauri -- build --bundles msi,nsis

# ---------- 6. 整理六件套 ----------
step "整理发布产物流入 release-artifacts/$NEW_VERSION"
node scripts/package-release.mjs

OUT_DIR="release-artifacts/$NEW_VERSION"
# 只保留 updater ZIP 的 .sig（后台 SIGNATURE 格子对应 ZIP 签名），删除安装器自身的 .sig
find "$OUT_DIR/signature" -name '*.sig' ! -name '*.zip.sig' -delete

# ---------- 7. 输出 ----------
echo
echo "打包完成：$OUT_DIR"
MSI_INSTALLER="$(basename "$OUT_DIR"/msi/*.msi)"
MSI_ZIP="$(basename "$OUT_DIR"/updater/*.msi.zip)"
NSIS_INSTALLER="$(basename "$OUT_DIR"/nsis/*.exe)"
NSIS_ZIP="$(basename "$OUT_DIR"/updater/*.nsis.zip)"
echo "  [msi]  安装器=$MSI_INSTALLER"
echo "  [msi]  updater=$MSI_ZIP"
echo "  [msi]  签名   =$MSI_ZIP.sig"
echo "  [nsis] 安装器=$NSIS_INSTALLER"
echo "  [nsis] updater=$NSIS_ZIP"
echo "  [nsis] 签名   =$NSIS_ZIP.sig"
echo "共 6 个文件（含 updater ZIP 与其签名），在后台「桌面版本发布」按格子上传即可。"
echo "签名私钥：$KEY_PATH（务必备份）"