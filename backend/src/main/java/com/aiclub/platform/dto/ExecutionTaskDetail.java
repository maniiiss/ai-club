package com.aiclub.platform.dto;

import java.util.List;

public record ExecutionTaskDetail(
        Long id,
        String title,
        String scenarioCode,
        String scenarioName,
        String sourceType,
        Long sourceId,
        String triggerSource,
        Long projectId,
        String projectName,
        Long workItemId,
        String workItemCode,
        String workItemName,
        String status,
        boolean cancelRequested,
        String latestSummary,
        Long createdByUserId,
        String createdByName,
        String createdAt,
        String updatedAt,
        Long currentRunId,
        String inputPayload,
        boolean planConfirmationRequired,
        boolean planConfirmationPending,
        boolean canCurrentUserConfirmPlan,
        List<ExecutionRunSummary> runs,
        ExecutionWorkspaceCleanupSummary workspaceCleanup,
        Long orchestrationVersionId,
        List<ExecutionResolvedBindingSummary> resolvedBindings
) {
}
