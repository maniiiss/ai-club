package com.aiclub.platform.dto;

/**
 * 流水线中心列表统一摘要。
 * 列表态只承载轻量字段，AI 流水线的配置状态改由详情页按需查询。
 */
public record PipelineCenterEntrySummary(
        String entryType,
        Long entryId,
        Long projectId,
        String projectName,
        String displayName,
        String providerCode,
        String defaultBranch,
        boolean enabled,
        String lastRunStatus,
        String lastRunMessage,
        String lastTriggeredAt,
        String primaryLabel,
        String primaryValue,
        String primaryUrl,
        String secondaryLabel,
        String secondaryValue,
        String configStatus
) {
}
