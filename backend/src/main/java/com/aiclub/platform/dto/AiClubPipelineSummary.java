package com.aiclub.platform.dto;

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
        Long woodpeckerRepoId,
        String woodpeckerRepoFullName,
        String woodpeckerRepoUrl,
        boolean enabled,
        String lastRunStatus,
        String lastRunMessage,
        Integer lastRunNumber,
        String lastRunUrl,
        String lastTriggeredAt
) {
}
