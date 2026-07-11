package com.aiclub.platform.dto;

/**
 * 业主仓库推送执行结果。
 * executionStatus 取值 SUCCESS / PARTIAL / FAILED。
 */
public record OwnerRepoPushResult(
        String executionStatus,
        String summaryMessage,
        String sourceCommitSha,
        String targetCommitSha,
        String pushedBranch,
        String mergeRequestIid,
        String mergeRequestWebUrl
) {
}
