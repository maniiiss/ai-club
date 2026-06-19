package com.aiclub.platform.dto;

/**
 * 匿名只读分享页的项目级自动合并日志数据。
 */
public record GitlabAutoMergePublicLogPage(
        Long projectId,
        String projectName,
        PageResponse<GitlabAutoMergeLogSummary> logs
) {
}
