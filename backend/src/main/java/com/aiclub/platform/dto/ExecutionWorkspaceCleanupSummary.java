package com.aiclub.platform.dto;

/**
 * 执行任务级工作区清理摘要。
 * 供执行详情页直接展示保留期、删除结果和排障提示，避免前端再逐个 run 拼装状态。
 */
public record ExecutionWorkspaceCleanupSummary(
        boolean enabled,
        long retentionHours,
        String status,
        String executionResultStatus,
        String expiresAt,
        String deletedAt,
        String deleteFailedAt,
        String deleteErrorMessage,
        int trackedWorkspaceCount,
        String message
) {
}
