ARG HERMES_BASE_IMAGE=nousresearch/hermes-agent:latest
FROM ${HERMES_BASE_IMAGE}

RUN apt-get update && apt-get install -y python3-pip && \
    pip3 install --break-system-packages hindsight-client

COPY apply_local_patch.py /opt/git-ai-club/hermes/apply_local_patch.py

# 对 Hermes API Server 做本地补丁：强制透传 reasoning 为 <think>，并剥离历史 assistant 消息里的 think 块。
RUN API_SERVER_PATH="$(
  /opt/hermes/.venv/bin/python - <<'PY'
import gateway.platforms.api_server as api_server
print(api_server.__file__)
PY
)" && \
  /opt/hermes/.venv/bin/python /opt/git-ai-club/hermes/apply_local_patch.py "$API_SERVER_PATH"

# 保持原有的 entrypoint 和 cmd
