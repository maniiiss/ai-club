package com.aiclub.platform.dto;

public record ProjectGitlabBindingSummary(
        Long id,
        Long projectId,
        String projectName,
        String apiBaseUrl,
        String gitlabProjectRef,
        String gitlabProjectId,
        String gitlabProjectName,
        String gitlabProjectPath,
        String gitlabProjectWebUrl,
        String defaultTargetBranch,
        String productMainBranch,
        String testProfileJson,
        Boolean tokenConfigured,
        Boolean enabled,
        String lastTestStatus,
        String lastTestMessage,
        String lastTestedAt,
        String codeStructureStatus,
        String codeStructureGeneratedAt,
        Boolean codeStructureDegraded
) {
}
