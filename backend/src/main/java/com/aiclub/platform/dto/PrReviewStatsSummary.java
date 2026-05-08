package com.aiclub.platform.dto;

import java.util.List;

/**
 * PR 评审统计结果。
 */
public record PrReviewStatsSummary(
        String startTime,
        String endTime,
        Long groupId,
        String groupName,
        String token,
        String userId,
        int totalPrCount,
        int closedPrCount,
        int mergedOrClosedDevelopmentCount,
        int unmergedDevelopmentCount,
        double rejectRate,
        double rejectTargetRate,
        boolean rejectRateQualified,
        boolean allMerged,
        String issueBracketSuggestion,
        String summaryMarkdown,
        List<PrReviewStatsPendingTaskGroupSummary> pendingTaskGroups
) {
}
