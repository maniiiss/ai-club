package com.aiclub.platform.dto;

/**
 * Assistant 会话全文搜索命中项。
 * 业务意图：让左侧搜索结果同时展示会话标题和真正命中的消息片段。
 */
public record AssistantConversationSearchResult(
        Long sessionId,
        String title,
        boolean archived,
        String matchedRole,
        String matchedContent,
        String matchedAt
) {
}
