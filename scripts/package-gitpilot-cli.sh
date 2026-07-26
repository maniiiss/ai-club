#!/usr/bin/env bash
# 打包 gitpilot-cli 源码为 tarball，供公众端一键安装脚本下载。
# 排除 node_modules/dist/.git/package-lock.json，输出到 frontend-public/public/downloads/gitpilot-cli.tar.gz。
# 发版时运行一次更新下载包。
# 用 bash + GNU tar，避免 PowerShell 5.x 读取无 BOM 脚本的中文乱码与 MSYS tar 路径解析问题。
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cli_dir="$repo_root/gitpilot-cli"
out_dir="$repo_root/frontend-public/public/downloads"
out_file="$out_dir/gitpilot-cli.tar.gz"

if [ ! -d "$cli_dir" ]; then
  echo "gitpilot-cli not found: $cli_dir" >&2
  exit 1
fi
mkdir -p "$out_dir"

echo '==> Packaging gitpilot-cli -> gitpilot-cli.tar.gz (prebuilt: dist + production node_modules)'
# 预构建打包：含已编译的 dist + 生产依赖 node_modules，排除源码 src 与 devDependencies，
# 用户解压后只需 npm link 即可运行，无需本地 npm install / build。
# 用 hardlink 副本 + npm prune --production 去掉 devDependencies（typescript/vitest/shx 等），
# 既缩小体积又不动原开发环境的 node_modules。
tmp_dir="$repo_root/.tmp/pkg"
rm -rf "$tmp_dir"
mkdir -p "$tmp_dir"
cp -rl "$cli_dir" "$tmp_dir/gitpilot-cli"
(cd "$tmp_dir/gitpilot-cli" && npm prune --production 2>/dev/null || true)
tar -czf "$out_file" \
  --exclude='gitpilot-cli/src' \
  --exclude='gitpilot-cli/.git' \
  --exclude='gitpilot-cli/package-lock.json' \
  --exclude='gitpilot-cli/.run-logs' \
  --exclude='gitpilot-cli/node_modules/.cache' \
  -C "$tmp_dir" gitpilot-cli
rm -rf "$tmp_dir"

size=$(du -h "$out_file" | cut -f1)
echo "[OK] Generated $out_file ($size)"
