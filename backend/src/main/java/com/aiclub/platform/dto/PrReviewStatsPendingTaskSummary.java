package com.aiclub.platform.dto;

/**
 * 未完成合并的开发任务明细。
 */
public record PrReviewStatsPendingTaskSummary(
        String ident,
        String title,
        String assigneeRemark,
        String projectName,
        String prTitle,
        String prState
) {
}
