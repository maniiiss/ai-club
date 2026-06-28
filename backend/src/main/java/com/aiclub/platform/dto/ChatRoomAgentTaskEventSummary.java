package com.aiclub.platform.dto;

/**
 * 聊天室 Agent 任务事件摘要。
 */
public record ChatRoomAgentTaskEventSummary(
        Long id,
        Long taskId,
        Long roomId,
        String eventType,
        String message,
        String payloadJson,
        String createdAt
) {
}
