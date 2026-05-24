package com.aiclub.platform.dto;

/**
 * 服务器列表卡片摘要。
 */
public record ServerSummary(
        Long id,
        String name,
        String description,
        String host,
        Integer port,
        String username,
        String osType,
        String authType,
        boolean enabled,
        boolean jumpHostEnabled,
        boolean passwordConfigured,
        boolean privateKeyConfigured,
        boolean jumpPasswordConfigured,
        boolean jumpPrivateKeyConfigured,
        String lastProbeStatus,
        String lastProbeMessage,
        String lastProbedAt,
        Integer lastCpuUsagePercent,
        Integer lastMemoryUsagePercent,
        Integer lastDiskUsagePercent,
        Integer activeAlertCount
) {
}
