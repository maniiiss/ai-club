package com.aiclub.platform.dto;

/**
 * 服务器资源采样点。
 */
public record ServerMetricSampleItem(
        String probeStatus,
        String probeMessage,
        Integer cpuUsagePercent,
        Integer memoryUsagePercent,
        Integer diskUsagePercent,
        String sampledAt
) {
}
