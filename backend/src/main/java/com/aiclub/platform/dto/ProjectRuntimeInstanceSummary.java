package com.aiclub.platform.dto;

import java.util.List;

public record ProjectRuntimeInstanceSummary(
        Long id,
        Long projectId,
        String projectName,
        String sourceType,
        Long sourceBindingId,
        String name,
        String environment,
        String serviceName,
        boolean enabled,
        String serverMode,
        Long serverId,
        String serverName,
        String externalBaseUrl,
        boolean logEnabled,
        List<String> logPaths,
        boolean healthEnabled,
        String healthProbeType,
        String healthTarget,
        String lastDeployedAt,
        String lastStatus,
        String lastStatusMessage
) {
}
