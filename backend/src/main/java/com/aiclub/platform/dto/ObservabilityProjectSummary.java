package com.aiclub.platform.dto;

/**
 * 可观测性中心项目列表摘要。
 */
public record ObservabilityProjectSummary(
        Long projectId,
        String projectName,
        String projectStatus,
        int instanceCount,
        int enabledInstanceCount,
        int abnormalInstanceCount,
        Integer projectHealthScore,
        String projectHealthLevel,
        String lastHealthCheckedAt,
        String lastLogCollectedAt,
        String lastLogCollectStatus,
        String lastLogCollectMessage
) {
}
