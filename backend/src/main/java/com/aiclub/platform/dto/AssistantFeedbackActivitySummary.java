package com.aiclub.platform.dto;

/** 反馈运营活动的只读回显项。 */
public record AssistantFeedbackActivitySummary(
        Long id,
        String actionType,
        String fromStatus,
        String toStatus,
        String note,
        Long actorUserId,
        String createdAt
) {
}
