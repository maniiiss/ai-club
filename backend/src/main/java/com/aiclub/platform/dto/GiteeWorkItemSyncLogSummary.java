package com.aiclub.platform.dto;

public record GiteeWorkItemSyncLogSummary(
        Long id,
        Long projectId,
        Long iterationId,
        String executionStatus,
        Integer totalIssueCount,
        Integer createdCount,
        Integer updatedCount,
        Integer removedCount,
        Integer failedCount,
        String summaryMessage,
        String executedAt
) {
}
