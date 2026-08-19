#!/usr/bin/env bash
# 构建并整理 GitPilot 桌面版 macOS（Apple Silicon / arm64）发布产物。
# 仿 scripts/build-release-windows.ps1，业务意图：只在本机内测出包，先不做
# Apple 代码签名/公证；自动更新（updater）仍与 Windows 走同一套 tauri signer 密钥。
#
# 产物（release-artifacts/<版本号>/）：
#   dmg/       —— .dmg 安装包（分发给用户）
#   app/       —— .app 未打包 bundle（调试/签名用）
#   updater/   —— .app.tar.gz（Tauri mac 自动更新包）
#   signature/ —— .sig（tauri signer 更新签名，与 Windows gitpilot.key 同一套密钥）
#
# 依赖：Node 22 / Rust / bun，必须在 macOS 上运行（Windows 无法交叉编译 apple target）。
#
# 用法：
#   ./scripts/build-release-macos.sh \
#       -ApiBaseUrl https://release.example.com \
#       [-SigningKeyPath ~/.tauri/gitpilot.key] \
#       [-SkipBuild]
set -euo pipefail

DESKTOP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TAURI_ROOT="$DESKTOP_ROOT/src-tauri"
TAURI_TARGET="aarch64-apple-darwin"
BUNDLE_TYPE="app,dmg"
SIDECAR_FILE="$TAURI_ROOT/binaries/gitpilot-rpc-$TAURI_TARGET"

# 与 build-release-windows.ps1 一致的默认密钥位置（跨平台复用同一签名密钥）
DEFAULT_KEY_PATH="$HOME/.tauri/gitpilot.key"

API_BASE_URL="${GITPILOT_DESKTOP_API_BASE_URL:-}"
SIGNING_KEY_PATH="${GITPILOT_SIGNING_KEY_PATH:-$DEFAULT_KEY_PATH}"
SKIP_BUILD=0
TEMP_CONFIG_PATH=""

usage() {
    echo "用法: $0 [-ApiBaseUrl <发布API基址>] [-SigningKeyPath <签名密钥路径>] [-SkipBuild]"
    echo "    发布API基址也可用环境变量 GITPILOT_DESKTOP_API_BASE_URL 提供。"
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        -ApiBaseUrl) API_BASE_URL="${2:-}"; shift 2 ;;
        -SigningKeyPath) SIGNING_KEY_PATH="${2:-}"; shift 2 ;;
        -SkipBuild) SKIP_BUILD=1; shift ;;
        -h|-help|--help) usage; exit 0 ;;
        *) echo "未知参数: $1" >&2; usage >&2; exit 1 ;;
    esac
done

step() { echo; printf '=== %s ===\n' "$1"; }

# 任意一步失败都先清理临时 config 再以非 0 退出，避免残留中间文件
cleanup() {
    if [[ -n "$TEMP_CONFIG_PATH" && -f "$TEMP_CONFIG_PATH" ]]; then
        rm -f "$TEMP_CONFIG_PATH"
    fi
}
trap cleanup EXIT

cd "$DESKTOP_ROOT"

step '检查构建环境'
for cmd in node npm cargo bun bash; do
    command -v "$cmd" >/dev/null 2>&1 || { echo "缺少依赖命令: $cmd，请先安装 Node 22 / Rust / bun。" >&2; exit 1; }
done

# sidecar 缺失时自动构建（sidecar/build.sh 会按平台自动分支到 mac/arm64）
if [[ ! -f "$SIDECAR_FILE" ]]; then
    echo "sidecar 缺失，调用 sidecar/build.sh 构建"
    bash "$DESKTOP_ROOT/sidecar/build.sh"
    [[ -f "$SIDECAR_FILE" ]] || { echo "sidecar 构建未产出: $SIDECAR_FILE" >&2; exit 1; }
fi

step '检查三处版本号一致'
PACKAGE_VERSION="$(node -p "require('$DESKTOP_ROOT/package.json').version")"
CARGO_VERSION="$(grep -E '^version[[:space:]]*=' "$TAURI_ROOT/Cargo.toml" | head -1 | sed -E 's/.*"([^"]+)".*/\1/')"
TAURI_VERSION="$(node -p "require('$TAURI_ROOT/tauri.conf.json').version")"
if [[ -z "$CARGO_VERSION" || "$PACKAGE_VERSION" != "$CARGO_VERSION" || "$PACKAGE_VERSION" != "$TAURI_VERSION" ]]; then
    echo "版本不一致：package.json=$PACKAGE_VERSION Cargo=$CARGO_VERSION tauri=$TAURI_VERSION。请先统一三处版本号。" >&2
    exit 1
fi
VERSION="$PACKAGE_VERSION"
echo "Version: $VERSION"

step '确定 updater 发布端点'
# 与 Windows 脚本一致的端点语义：给定基础 URL 时补全 template 后缀
TEMPLATE_SUFFIX="/api/desktop-updates/{{target}}/{{arch}}/{{bundle_type}}/{{current_version}}"
if [[ -z "$API_BASE_URL" ]]; then
    CONFIGURED="$(node -p "require('$TAURI_ROOT/tauri.conf.json').plugins?.updater?.endpoints?.[0] || ''")"
    if [[ -n "$CONFIGURED" && "$CONFIGURED" != *"platform.example"* ]]; then
        API_BASE_URL="${CONFIGURED%/api/desktop-updates/*}"
    else
        read -r -p '输入发布 API 基础 URL，例如 https://release.example.com：' API_BASE_URL
    fi
fi
API_BASE_URL="${API_BASE_URL%/}"
if [[ -z "$API_BASE_URL" || "$API_BASE_URL" == *"platform.example"* ]]; then
    echo '需要真实的发布 API URL，请用 -ApiBaseUrl 传入。' >&2
    exit 1
fi
if [[ "$API_BASE_URL" == *"$TEMPLATE_SUFFIX" ]]; then
    UPDATER_ENDPOINT="$API_BASE_URL"
else
    UPDATER_ENDPOINT="$API_BASE_URL$TEMPLATE_SUFFIX"
fi
echo "Updater endpoint: $UPDATER_ENDPOINT"

step '检查/生成 updater 签名密钥'
SIGNING_KEY_PATH="${SIGNING_KEY_PATH:-$DEFAULT_KEY_PATH}"
SIGNING_KEY_PATH="$(cd "$(dirname "$SIGNING_KEY_PATH")" && pwd)/$(basename "$SIGNING_KEY_PATH")"
if [[ ! -f "$SIGNING_KEY_PATH" ]]; then
    echo "签名私钥不存在: $SIGNING_KEY_PATH"
    read -r -p '现在生成新的 updater 签名密钥？输入 Y 继续，其他退出：' ANSWER
    if [[ "$ANSWER" != "Y" && "$ANSWER" != "y" ]]; then
        echo '未生成签名密钥，无法生成 signature/.sig 产物，退出。' >&2
        exit 1
    fi
    mkdir -p "$(dirname "$SIGNING_KEY_PATH")"
    echo 'tauri 会要求你为该密钥设密码，请保存到密码管理器。'
    npm run tauri -- signer generate -w "$SIGNING_KEY_PATH"
fi
PUB_KEY_PATH="$SIGNING_KEY_PATH.pub"
[[ -f "$PUB_KEY_PATH" ]] || { echo "公钥缺失: $PUB_KEY_PATH" >&2; exit 1; }
PUB_KEY="$(tr -d '[:space:]' < "$PUB_KEY_PATH")"
[[ -n "$PUB_KEY" ]] || { echo "公钥为空: $PUB_KEY_PATH" >&2; exit 1; }
echo "签名密钥: $SIGNING_KEY_PATH（私钥永不复制到发布目录）"

if [[ "$SKIP_BUILD" -eq 0 ]]; then
    step '读取签名密码并构建 app、dmg 与 updater 产物'
    SIGNING_PASSWORD="${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}"
    if [[ -z "$SIGNING_PASSWORD" ]]; then
        read -r -s -p '输入 updater 签名密钥密码（无密码直接回车）：' SIGNING_PASSWORD
        echo
    fi

    # 业务意图：通过临时 config overlay 注入 pubkey + 真实端点，不改源码配置。
    # macOS 的 mktemp 要求 XXXXXX 模板位于文件名末尾，故不加 .json 后缀（内容仍为 JSON）。
    TEMP_CONFIG_PATH="$(mktemp /tmp/gitpilot-tauri-release-XXXXXX)"
    PUB_KEY="$PUB_KEY" UPDATER_ENDPOINT="$UPDATER_ENDPOINT" node -e '
        const fs = require("fs");
        const overlay = {
            plugins: {
                updater: {
                    pubkey: process.env.PUB_KEY,
                    endpoints: [process.env.UPDATER_ENDPOINT],
                },
            },
        };
        fs.writeFileSync(process.argv[1], JSON.stringify(overlay, null, 2));
    ' "$TEMP_CONFIG_PATH"

    export TAURI_SIGNING_PRIVATE_KEY="$SIGNING_KEY_PATH"
    export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="$SIGNING_PASSWORD"
    npm run tauri -- build --config "$TEMP_CONFIG_PATH" --bundles "$BUNDLE_TYPE" --target "$TAURI_TARGET"
    unset TAURI_SIGNING_PRIVATE_KEY TAURI_SIGNING_PRIVATE_KEY_PASSWORD
else
    echo "SkipBuild 开启，直接整理现有 Tauri 构建结果。"
fi

step '整理发布上传产物'
OUTPUT_DIR="$DESKTOP_ROOT/release-artifacts/$VERSION"
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"/app "$OUTPUT_DIR"/dmg "$OUTPUT_DIR"/updater "$OUTPUT_DIR"/signature

BUNDLE_BASE="$TAURI_ROOT/target/$TAURI_TARGET/release/bundle"
# .app 未打包 bundle（存在则收集）
for app in "$BUNDLE_BASE"/macos/*.app; do
    [[ -e "$app" ]] && cp -R "$app" "$OUTPUT_DIR"/app/
done
# .dmg 安装包
for dmg in "$BUNDLE_BASE"/dmg/*.dmg; do
    [[ -e "$dmg" ]] && cp "$dmg" "$OUTPUT_DIR"/dmg/
done
# updater .app.tar.gz，并对其中每个用 tauri signer 生成 .sig（跨平台同一套密钥）
for archive in "$BUNDLE_BASE"/macos/*.app.tar.gz; do
    [[ -e "$archive" ]] || continue
    cp "$archive" "$OUTPUT_DIR"/updater/
    SIGN_ARGS=(signer sign -k "$SIGNING_KEY_PATH")
    if [[ -n "${SIGNING_PASSWORD:-}" ]]; then
        SIGN_ARGS+=(-p "$SIGNING_PASSWORD")
    fi
    npm run tauri -- "${SIGN_ARGS[@]}" "$archive"
    SIG_FILE="$archive.sig"
    if [[ -f "$SIG_FILE" ]]; then
        cp "$SIG_FILE" "$OUTPUT_DIR"/signature/
    else
        echo "警告：未找到签名产物 $SIG_FILE" >&2
    fi
done

# 校验产物矩阵完整（dmg 安装包 + 至少一个 updater + 至少一个签名）
DMG_COUNT=$(find "$OUTPUT_DIR/dmg" -name '*.dmg' 2>/dev/null | wc -l | tr -d ' ')
APP_COUNT=$(find "$OUTPUT_DIR/app" -maxdepth 1 -name '*.app' 2>/dev/null | wc -l | tr -d ' ')
UPDATER_COUNT=$(find "$OUTPUT_DIR/updater" -name '*.tar.gz' 2>/dev/null | wc -l | tr -d ' ')
SIG_COUNT=$(find "$OUTPUT_DIR/signature" -name '*.sig' 2>/dev/null | wc -l | tr -d ' ')
if [[ "$DMG_COUNT" -lt 1 || "$UPDATER_COUNT" -lt 1 || "$SIG_COUNT" -lt 1 ]]; then
    echo "产物矩阵不完整：dmg=$DMG_COUNT updater=$UPDATER_COUNT signature=$SIG_COUNT" >&2
    exit 1
fi

echo
echo "macOS 发布产物已就绪: $OUTPUT_DIR"
echo "  1. dmg/       —— ${DMG_COUNT} 个安装包，上传到管理端“桌面版本发布”页"
echo "  2. app/       —— ${APP_COUNT} 个未打包 bundle（可选）"
echo "  3. updater/   —— ${UPDATER_COUNT} 个 .app.tar.gz（自动更新包）"
echo "  4. signature/ —— ${SIG_COUNT} 个 .sig（更新签名）"
echo "警告：绝不要上传签名私钥 .key 文件。"