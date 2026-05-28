package com.aiclub.platform.dto;

/**
 * 流水线 cron 摘要，供详情页自动化面板展示。
 */
public record AiClubPipelineCronSummary(
        Long id,
        Long remoteCronId,
        String name,
        String branch,
        String cronExpression,
        boolean enabled,
        String nextRunAt,
        String lastSyncedAt
) {
}
