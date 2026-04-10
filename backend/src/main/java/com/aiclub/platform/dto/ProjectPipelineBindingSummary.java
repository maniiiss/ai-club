package com.aiclub.platform.dto;

public record ProjectPipelineBindingSummary(
        Long id,
        Long projectId,
        String projectName,
        Long jenkinsServerId,
        String jenkinsServerName,
        String jobName,
        String jobUrl,
        String defaultBranch,
        String buildParametersJson,
        boolean enabled,
        String lastTriggerStatus,
        String lastTriggerMessage,
        String lastTriggeredAt,
        String lastTriggerUrl
) {
}
