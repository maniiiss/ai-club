package com.aiclub.platform.dto;

public record IterationGiteeBindingSummary(
        Long id,
        Long iterationId,
        Long projectId,
        String projectName,
        String iterationName,
        Long giteeMilestoneId,
        String giteeMilestoneTitle
) {
}
