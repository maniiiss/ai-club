package com.aiclub.platform.dto;

import java.util.List;

/**
 * 项目健康概览。
 */
public record ObservabilityProjectHealthSummary(
        Long projectId,
        String projectName,
        Integer projectHealthScore,
        String projectHealthLevel,
        String lastHealthCheckedAt,
        int totalInstanceCount,
        int enabledInstanceCount,
        int abnormalInstanceCount,
        List<ObservabilityRuntimeInstanceHealthSummary> instances
) {
}
