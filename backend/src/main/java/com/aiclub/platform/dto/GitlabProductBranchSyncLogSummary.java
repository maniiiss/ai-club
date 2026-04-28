package com.aiclub.platform.dto;

public record GitlabProductBranchSyncLogSummary(
        Long id,
        Long productBranchId,
        String lineCode,
        String lineName,
        String sourceBranchName,
        String targetBranchName,
        String sourceCommitSha,
        String targetCommitSha,
        Long mergeRequestIid,
        String mergeRequestTitle,
        String mergeRequestWebUrl,
        String result,
        String reason,
        Long executedByUserId,
        String executedAt
) {
}
