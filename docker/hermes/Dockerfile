FROM nousresearch/hermes-agent:latest

RUN apt-get update && apt-get install -y python3-pip && \
    pip3 install --break-system-packages hindsight-client

# 保持原有的 entrypoint 和 cmd
