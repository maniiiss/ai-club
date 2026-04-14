package com.aiclub.platform.dto;

/**
 * Hermes 会话列表中的轻量摘要项。
 */
public record HermesConversationSessionSummary(
        Long id,
        String title,
        boolean titleCustomized,
        String routeName,
        Long projectId,
        Long taskId,
        Long iterationId,
        Long planId,
        String latestPreview,
        boolean archived,
        String createdAt,
        String updatedAt,
        String lastMessageAt
) {
}
