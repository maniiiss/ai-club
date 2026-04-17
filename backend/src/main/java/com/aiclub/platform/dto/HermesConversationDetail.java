package com.aiclub.platform.dto;

import java.util.List;

/**
 * Hermes 会话详情，用于回显历史记录与当前展示态。
 */
public record HermesConversationDetail(
        Long id,
        String title,
        boolean titleCustomized,
        String routeName,
        Long projectId,
        Long taskId,
        Long iterationId,
        Long planId,
        Long wikiSpaceId,
        Long wikiPageId,
        String latestPreview,
        boolean archived,
        String createdAt,
        String updatedAt,
        String lastMessageAt,
        HermesLatestDisplayState latestDisplayState,
        List<HermesConversationMessageItem> messages
) {
    public HermesConversationDetail {
        latestDisplayState = latestDisplayState == null ? HermesLatestDisplayState.empty() : latestDisplayState;
        messages = messages == null ? List.of() : List.copyOf(messages);
    }
}
