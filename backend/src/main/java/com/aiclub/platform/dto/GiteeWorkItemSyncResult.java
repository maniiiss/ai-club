package com.aiclub.platform.dto;

public record GiteeWorkItemSyncResult(
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
