#!/usr/bin/env bash
# GitPilot CLI 一键安装脚本（Linux / macOS）
# 用法: curl -fsSL <BASE>/downloads/install.sh | bash
#
# 业务意图：用户执行一条命令即可下载源码包、构建并注册 gitpilot 全局命令，无需手动 git clone。
set -euo pipefail

# 下载基础地址：优先环境变量 GITPILOT_DOWNLOAD_BASE，默认回退本地公众端（开发测试）。
# 生产部署：export GITPILOT_DOWNLOAD_BASE 为公众端域名，或在此改为生产域名，
# 并与后端 PLATFORM_GITPILOT_CLI_DOWNLOAD_BASE_URL 保持一致。
DOWNLOAD_BASE="${GITPILOT_DOWNLOAD_BASE:-http://localhost:5175}"
DOWNLOAD_BASE="${DOWNLOAD_BASE%/}"
TARBALL_URL="${DOWNLOAD_BASE}/downloads/gitpilot-cli.tar.gz"
INSTALL_DIR="${HOME}/.gitpilot/cli"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "==> 下载 GitPilot CLI 源码包..."
curl -fsSL "$TARBALL_URL" -o "$TMP_DIR/gitpilot-cli.tar.gz"

echo "==> 解压到 ~/.gitpilot/cli..."
mkdir -p "$(dirname "$INSTALL_DIR")"
rm -rf "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
tar -xzf "$TMP_DIR/gitpilot-cli.tar.gz" -C "$INSTALL_DIR" --strip-components=1

echo "==> 注册 gitpilot 命令..."
cd "$INSTALL_DIR"
# tarball 已含预构建的 dist + node_modules，只需 npm link 注册全局 gitpilot 命令，无需 install/build。
npm link

echo ""
echo "[OK] GitPilot CLI 安装完成"
echo "已安装到: $INSTALL_DIR"
echo '下一步: 运行 "gitpilot" 启动，然后输入 /login 完成设备授权。'
