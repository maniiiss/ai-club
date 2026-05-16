#!/bin/sh
set -e

# 启动静态服务前生成浏览器可读取的 GitNexus 运行时配置。
node /app/write-gitnexus-runtime-config.mjs

exec docker-entrypoint.sh "$@"
