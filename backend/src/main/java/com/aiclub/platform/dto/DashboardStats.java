package com.aiclub.platform.dto;

public record DashboardStats(
        Integer projectCount,
        Integer agentCount,
        Integer taskCount,
        Integer repoCount,
        Integer myTaskCount,
        Integer myInProgressTaskCount,
        Integer myPendingTaskCount,
        Integer myMergeLogCount,
        Integer mergeAlertCount
) {
}
