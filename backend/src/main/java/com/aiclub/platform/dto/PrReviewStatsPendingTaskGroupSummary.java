package com.aiclub.platform.dto;

import java.util.List;

/**
 * 按处理人聚合的未合并任务清单。
 */
public record PrReviewStatsPendingTaskGroupSummary(
        String assigneeRemark,
        int count,
        String issueBracketText,
        List<PrReviewStatsPendingTaskSummary> tasks
) {
}
