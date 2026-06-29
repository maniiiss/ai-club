package com.aiclub.platform.dto;

/**
 * 聊天室 Agent 任务摘要。
 */
public record ChatRoomAgentTaskSummary(
        Long id,
        Long roomId,
        Long assistantMessageId,
        Long triggerMessageId,
        Long triggerUserId,
        Long authorizedByUserId,
        String triggerType,
        String status,
        String source,
        String sourceRef,
        String payloadJson,
        String errorMessage,
        String startedAt,
        String finishedAt,
        String createdAt,
        String updatedAt
) {
}
