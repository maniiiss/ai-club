package com.aiclub.platform.dto;

import java.util.List;
import java.util.Map;

public record AiClubPipelineSummary(
        Long id,
        Long projectId,
        String projectName,
        Long gitlabBindingId,
        String gitlabProjectName,
        String gitlabProjectPath,
        String gitlabProjectWebUrl,
        String name,
        String providerCode,
        String defaultBranch,
        String configPath,
        Map<String, String> triggerVariables,
        Long woodpeckerRepoId,
        String woodpeckerRepoFullName,
        String woodpeckerRepoUrl,
        boolean enabled,
        String lastRunStatus,
        String lastRunMessage,
        Integer lastRunNumber,
        String lastRunUrl,
        String lastTriggeredAt,
        long cronCount,
        boolean triggerWebhookEnabled,
        boolean callbackWebhookEnabled,
        List<String> callbackSubscribedStatuses
) {
}
