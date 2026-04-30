package com.aiclub.platform.dto;

public record GiteeTestPlanPushResult(
        String executionStatus,
        String testPlanAction,
        Long remoteTestPlanId,
        int createdCaseCount,
        int updatedCaseCount,
        int failedCaseCount,
        String summaryMessage,
        String executedAt
) {
}
