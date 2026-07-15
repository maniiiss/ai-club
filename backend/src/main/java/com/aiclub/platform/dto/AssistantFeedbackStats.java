package com.aiclub.platform.dto;

/** GitPilot 反馈运营概览统计。 */
public record AssistantFeedbackStats(
        long newCount,
        long inProgressCount,
        long resolvedCount,
        long negativeCount,
        long totalCount
) {
}
