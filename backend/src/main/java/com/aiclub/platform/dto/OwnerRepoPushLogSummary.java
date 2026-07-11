package com.aiclub.platform.dto;

/**
 * 业主仓库推送历史日志详情。
 */
public record OwnerRepoPushLogSummary(
        Long id,
        Long sourceBindingId,
        String sourceBindingName,
        String sourceBranch,
        String targetBranch,
        String pushMode,
        String sourceCommitSha,
        String targetCommitSha,
        String mergeRequestIid,
        String mergeRequestWebUrl,
        String executionStatus,
        String summaryMessage,
        String executedAt
) {
}
