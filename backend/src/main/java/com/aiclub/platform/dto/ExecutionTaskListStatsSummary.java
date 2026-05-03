package com.aiclub.platform.dto;

/**
 * 执行中心列表顶部统计卡片摘要。
 */
public record ExecutionTaskListStatsSummary(
        /**
         * 当前筛选结果中的任务总数。
         */
        Integer totalCount,
        /**
         * 当前筛选结果中待执行、执行中和待确认任务总数。
         */
        Integer pendingOrRunningCount,
        /**
         * 当前筛选结果中的成功任务总数。
         */
        Integer successCount,
        /**
         * 当前筛选结果中的平均进度，范围 0-100。
         */
        Integer averageProgressPercent
) {
}
