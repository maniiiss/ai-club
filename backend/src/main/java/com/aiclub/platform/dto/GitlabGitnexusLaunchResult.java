package com.aiclub.platform.dto;

/**
 * GitNexus 全仓图跳转结果。
 */
public record GitlabGitnexusLaunchResult(
        String branchName,
        String commitSha,
        String repoAlias,
        String gitnexusUiUrl,
        String gitnexusServerUrl,
        String launchUrl,
        boolean serveReady
) {
}
