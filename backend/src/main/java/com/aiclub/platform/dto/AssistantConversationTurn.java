package com.aiclub.platform.dto;

/**
 * Assistant 会话中持久化到 Redis 的一条最小对话消息。
 * 这里只保留角色和最终文本，避免把临时系统提示词重复写入会话历史。
 */
public record AssistantConversationTurn(
        String role,
        String content
) {
    /**
     * 创建一条用户消息。
     */
    public static AssistantConversationTurn user(String content) {
        return new AssistantConversationTurn("user", content == null ? "" : content.trim());
    }

    /**
     * 创建一条助手消息。
     */
    public static AssistantConversationTurn assistant(String content) {
        return new AssistantConversationTurn("assistant", content == null ? "" : content.trim());
    }
}
