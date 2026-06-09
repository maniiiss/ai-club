package com.aiclub.platform.dto;

/**
 * 项目运行日志分页项。
 */
public record ObservabilityProjectLogSummary(
        Long id,
        Long runtimeInstanceId,
        String runtimeInstanceName,
        String sourceType,
        String sourcePath,
        String logLevel,
        String logger,
        String traceId,
        String message,
        String raw,
        String loggedAt,
        String collectedAt
) {
}
