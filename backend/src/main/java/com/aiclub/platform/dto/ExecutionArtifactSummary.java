package com.aiclub.platform.dto;

public record ExecutionArtifactSummary(
        Long id,
        Long runId,
        Long stepId,
        String artifactType,
        String title,
        String contentRef,
        String contentText,
        boolean workItemWriteback
) {
}
