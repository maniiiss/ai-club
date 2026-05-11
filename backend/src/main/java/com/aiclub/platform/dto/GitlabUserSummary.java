package com.aiclub.platform.dto;

/**
 * GitLab 用户候选快照，用于平台用户管理绑定远端账号。
 */
public record GitlabUserSummary(
        Long id,
        String username,
        String name,
        String email,
        String avatarUrl,
        String webUrl
) {
}
