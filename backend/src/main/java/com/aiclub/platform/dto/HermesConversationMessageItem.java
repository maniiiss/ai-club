package com.aiclub.platform.dto;

/**
 * Hermes 会话详情中的单条消息回显项。
 */
public record HermesConversationMessageItem(
        Long id,
        String role,
        String content,
        String status,
        String createdAt
) {
}
