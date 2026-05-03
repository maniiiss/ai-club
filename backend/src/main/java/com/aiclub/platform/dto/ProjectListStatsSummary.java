package com.aiclub.platform.dto;

/**
 * 项目管理列表顶部统计卡片摘要。
 */
public record ProjectListStatsSummary(
        /**
         * 当前筛选结果中的项目总数。
         */
        Integer activeProjectCount,
        /**
         * 当前筛选结果下所有项目的任务总量。
         */
        Integer totalTaskCount,
        /**
         * 当前筛选结果中“进行中”项目占比，范围 0-100。
         */
        Integer resourceLoadPercent,
        /**
         * 当前筛选结果下的项目平均任务数。
         */
        Double averageTaskCount
) {
}
