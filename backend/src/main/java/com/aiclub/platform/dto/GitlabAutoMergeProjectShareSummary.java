package com.aiclub.platform.dto;

/**
 * 项目级自动合并日志分享配置摘要。
 */
public record GitlabAutoMergeProjectShareSummary(
        Long projectId,
        String projectName,
        Boolean enabled,
        String expiresAt,
        String shareUrl
) {
}
