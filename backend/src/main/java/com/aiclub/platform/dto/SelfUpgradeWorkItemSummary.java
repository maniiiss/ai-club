package com.aiclub.platform.dto;

public record SelfUpgradeWorkItemSummary(
        Long id,
        Long suggestionId,
        String title,
        String description,
        String priority,
        String status,
        Long assigneeUserId,
        String assigneeUserName,
        String repositoryBindingsJson,
        String executionPrompt,
        Long latestExecutionTaskId,
        Long acceptedByUserId,
        String acceptedByName,
        String acceptedAt,
        String resolvedAt,
        String createdAt,
        String updatedAt
) {
}
