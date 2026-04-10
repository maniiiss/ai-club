package com.aiclub.platform.dto;

public record GitlabAutoMergeLogSummary(
        Long id,
        Long configId,
        String configName,
        String triggerType,
        Long mergeRequestIid,
        String mergeRequestTitle,
        String mergeRequestAuthorName,
        String mergeRequestAuthorUsername,
        String result,
        String reason,
        String detailMarkdown,
        String webUrl,
        String executedAt
) {
}
