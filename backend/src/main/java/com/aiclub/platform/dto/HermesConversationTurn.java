package com.aiclub.platform.dto;

/**
 * Hermes 会话中持久化到 Redis 的一条最小对话消息。
 * 这里只保留角色和最终文本，避免把临时系统提示词重复写入会话历史。
 */
public record HermesConversationTurn(
        String role,
        String content
) {
    /**
     * 创建一条用户消息。
     */
    public static HermesConversationTurn user(String content) {
        return new HermesConversationTurn("user", content == null ? "" : content.trim());
    }

    /**
     * 创建一条助手消息。
     */
    public static HermesConversationTurn assistant(String content) {
        return new HermesConversationTurn("assistant", content == null ? "" : content.trim());
    }
}
