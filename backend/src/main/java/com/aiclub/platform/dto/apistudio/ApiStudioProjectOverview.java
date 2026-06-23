package com.aiclub.platform.dto.apistudio;

/**
 * 原生 API 工作台 - 项目概览。
 */
public record ApiStudioProjectOverview(
        Long projectId,
        String projectName,
        Integer directoryCount,
        Integer endpointCount,
        Integer environmentCount,
        Long defaultEnvironmentId,
        String defaultEnvironmentName
) {
}
