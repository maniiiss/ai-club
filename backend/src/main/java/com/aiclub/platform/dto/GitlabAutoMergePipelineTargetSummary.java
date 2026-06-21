package com.aiclub.platform.dto;

/**
 * 自动合并策略里已选择的触发目标摘要。
 */
public record GitlabAutoMergePipelineTargetSummary(
        String targetType,
        Long targetId,
        String targetName,
        String providerName,
        String defaultBranch,
        boolean enabled
) {
}
