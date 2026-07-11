package com.aiclub.platform.dto;
import java.util.List;

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
        String updatedAt,
        Long orchestrationVersionId,
        List<ExecutionResolvedBindingSummary> resolvedBindings
) {
    /** 兼容内部测试和旧模块尚未关注编排快照的构造调用。 */
    public ExecutionTaskSummary(Long id, String title, String scenarioCode, String scenarioName,
                                String sourceType, Long sourceId, Long projectId, String projectName,
                                Long workItemId, String workItemCode, String workItemName, String status,
                                Long currentRunId, String currentRunStatus, Integer progressPercent,
                                Integer currentStepNo, String currentStepName, String latestSummary,
                                boolean planConfirmationRequired, boolean planConfirmationPending,
                                Long createdByUserId, String createdByName, String createdAt, String updatedAt) {
        this(id, title, scenarioCode, scenarioName, sourceType, sourceId, projectId, projectName,
                workItemId, workItemCode, workItemName, status, currentRunId, currentRunStatus,
                progressPercent, currentStepNo, currentStepName, latestSummary, planConfirmationRequired,
                planConfirmationPending, createdByUserId, createdByName, createdAt, updatedAt, null, List.of());
    }
}
