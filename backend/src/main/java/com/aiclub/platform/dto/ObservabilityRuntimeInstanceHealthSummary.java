package com.aiclub.platform.dto;

/**
 * 运行实例健康摘要。
 */
public record ObservabilityRuntimeInstanceHealthSummary(
        Long runtimeInstanceId,
        String runtimeInstanceName,
        String environment,
        String serviceName,
        boolean enabled,
        String probeType,
        String probeTarget,
        Integer healthScore,
        String healthLevel,
        String availabilityStatus,
        Integer httpStatus,
        Long latencyMs,
        String failureReason,
        String sampledAt
) {
}
