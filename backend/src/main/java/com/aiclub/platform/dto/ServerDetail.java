package com.aiclub.platform.dto;

import java.util.List;

/**
 * 服务器详情。
 * 凭据只返回“是否已配置”，绝不返回解密后的明文内容。
 */
public record ServerDetail(
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
        String jumpHost,
        Integer jumpPort,
        String jumpUsername,
        String jumpAuthType,
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
        Integer activeAlertCount,
        ServerAlertConfigView effectiveAlertConfig,
        List<ServerAlertStateItem> alertStates
) {
}
