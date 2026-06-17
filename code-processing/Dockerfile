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
COPY --from=gitnexus-cli /usr/local/bin/gitnexus /usr/local/bin/gitnexus
COPY --from=gitnexus-cli /app/gitnexus /app/gitnexus
COPY --from=gitnexus-cli /home/node/.lbdb /home/node/.lbdb

RUN mkdir -p /home/node \
    && chmod +x /usr/local/bin/node /usr/local/bin/gitnexus

COPY pyproject.toml README.md ./
COPY app ./app

RUN pip install --no-cache-dir .

EXPOSE 9000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "9000"]
