package com.aiclub.platform.dto;

/**
 * 当前筛选结果下的工作项统计摘要。
 */
public record ProjectWorkItemStatsSummary(
        /**
         * 当前筛选结果总数。
         */
        Integer totalCount,
        /**
         * 当前筛选结果中的完成态数量。
         */
        Integer completedCount,
        /**
         * 当前筛选结果中的未完成数量。
         */
        Integer openCount,
        /**
         * 当前筛选结果中的缺陷数量。
         */
        Integer defectCount,
        /**
         * 当前筛选结果的完成率，范围 0-100。
         */
        Integer completionRate
) {
}
