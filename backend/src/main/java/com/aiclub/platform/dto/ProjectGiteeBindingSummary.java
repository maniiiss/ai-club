package com.aiclub.platform.dto;

public record ProjectGiteeBindingSummary(
        Long id,
        Long projectId,
        String projectName,
        Long enterpriseId,
        String apiBaseUrl,
        Long giteeProgramId,
        String giteeProgramName,
        boolean tokenConfigured,
        boolean enabled,
        String lastTestStatus,
        String lastTestMessage,
        String lastTestedAt
) {
}
