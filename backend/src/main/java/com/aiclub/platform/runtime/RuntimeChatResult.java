package com.aiclub.platform.runtime;

/**
 * Runtime 同步聊天结果。
 * 业务意图：把 Pi 等状态化 Runtime 的最终文本统一转换为平台会话可以持久化的结果。
 */
public record RuntimeChatResult(
        String runId,
        String sessionId,
        String content,
        RuntimeHealthStatus status
) {
    public RuntimeChatResult {
        content = content == null ? "" : content;
        status = status == null ? RuntimeHealthStatus.HEALTHY : status;
    }
}
