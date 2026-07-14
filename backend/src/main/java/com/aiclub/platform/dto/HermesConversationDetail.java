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
        String runtimeRegistryCode,
        Long runtimeProfileVersion,
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
        List<HermesConversationMessageItem> messages,
        /**
         * 当前会话内已被用户确认执行过的动作 key 列表。
         * 前端据此把"可执行动作"按钮恢复为"已执行"，避免重复触发同一写入动作。
         */
        List<String> executedActionKeys
) {
    public HermesConversationDetail {
        latestDisplayState = latestDisplayState == null ? HermesLatestDisplayState.empty() : latestDisplayState;
        messages = messages == null ? List.of() : List.copyOf(messages);
        executedActionKeys = executedActionKeys == null ? List.of() : List.copyOf(executedActionKeys);
    }
}
