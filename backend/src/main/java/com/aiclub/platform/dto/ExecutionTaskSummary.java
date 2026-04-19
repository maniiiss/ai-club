package com.aiclub.platform.dto;

public record ExecutionTaskSummary(
        Long id,
        String title,
        String scenarioCode,
        String scenarioName,
        String sourceType,
        Long sourceId,
        Long projectId,
        String projectName,
        Long workItemId,
        String workItemCode,
        String workItemName,
        String status,
        Long currentRunId,
        String currentRunStatus,
        Integer progressPercent,
        Integer currentStepNo,
        String currentStepName,
        String latestSummary,
        boolean planConfirmationRequired,
        boolean planConfirmationPending,
        Long createdByUserId,
        String createdByName,
        String createdAt,
        String updatedAt
) {
}
