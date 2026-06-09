package com.aiclub.platform.dto;

import java.util.List;

/**
 * 可观测性项目详情。
 */
public record ObservabilityProjectDetail(
        ObservabilityProjectSummary summary,
        List<ProjectRuntimeInstanceSummary> instances
) {
}
