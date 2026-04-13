package com.aiclub.platform.dto;

/**
 * 当前登录用户在默认 GitLab 实例上的 OAuth 绑定摘要。
 */
public record GitlabUserOauthBindingSummary(
        boolean connected,
        String apiBaseUrl,
        Long gitlabUserId,
        String gitlabUsername,
        String gitlabName,
        String expiresAt
) {
}
