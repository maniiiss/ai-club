ARG GITNEXUS_CLI_IMAGE=ghcr.io/abhigyanpatwari/gitnexus:latest
FROM ${GITNEXUS_CLI_IMAGE} AS gitnexus-cli

FROM python:3.11-slim
WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV TZ=Asia/Shanghai
ENV HOME=/home/node

RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

# 复用 GitNexus 官方 CLI 镜像中的 Node 运行时与预构建产物，避免 code-processing 容器内缺少 gitnexus 命令。
COPY --from=gitnexus-cli /usr/local/bin/node /usr/local/bin/node
COPY --from=gitnexus-cli /app/gitnexus /app/gitnexus
COPY --from=gitnexus-cli /home/node/.lbdb /home/node/.lbdb

RUN mkdir -p /home/node \
    && printf '%s\n' '#!/bin/sh' \
        '# GitNexus 官方镜像里的 /usr/local/bin/gitnexus 是软链接；跨镜像 COPY 会被拍平成普通文件，' \
        '# 这里显式调用真实入口，确保 commander 等依赖仍从 /app/gitnexus/node_modules 解析。' \
        'exec /usr/local/bin/node /app/gitnexus/dist/cli/index.js "$@"' \
        > /usr/local/bin/gitnexus \
    && chmod +x /usr/local/bin/node /usr/local/bin/gitnexus

COPY pyproject.toml README.md ./
COPY app ./app

RUN pip install --no-cache-dir .

EXPOSE 9000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "9000"]
