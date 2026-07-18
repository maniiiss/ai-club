package com.aiclub.platform.dto;

/** 公众端批量需求 AI 的逐项创建结果。 */
public record BatchRequirementAiOperationItem(
        Long taskId,
        ExecutionTaskSummary executionTask,
        String errorMessage
) {
}
