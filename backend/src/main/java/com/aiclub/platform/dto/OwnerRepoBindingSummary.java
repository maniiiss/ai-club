package com.aiclub.platform.dto;

/**
 * 业主代码仓库绑定详情。
 * Token 不回显，仅返回 tokenConfigured 标识是否已配置。
 */
public record OwnerRepoBindingSummary(
        Long id,
        Long projectId,
        String projectName,
        String name,
        String apiBaseUrl,
        String gitlabProjectRef,
        String gitlabProjectId,
        String gitlabProjectName,
        String gitlabProjectPath,
        String gitlabProjectWebUrl,
        String gitlabHttpCloneUrl,
        String gitlabSshCloneUrl,
        String defaultTargetBranch,
        String defaultPushMode,
        Boolean tokenConfigured,
        Boolean enabled,
        String lastPushStatus,
        String lastPushMessage,
        String lastPushedAt,
        String createdAt,
        String updatedAt
) {
}
