package com.aiclub.platform.dto;

import java.util.List;

/**
 * PR 评审统计页面初始化配置。
 */
public record PrReviewStatsConfigSummary(
        String oaBaseUrl,
        String defaultDevGroupName,
        List<PrReviewStatsGroupSummary> groups
) {
}
