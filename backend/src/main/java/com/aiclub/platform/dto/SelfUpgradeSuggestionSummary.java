package com.aiclub.platform.dto;

public record SelfUpgradeSuggestionSummary(
        Long id,
        String fingerprint,
        String title,
        String category,
        String severity,
        String status,
        Integer hitCount,
        Integer reopenCount,
        String firstFoundAt,
        String lastFoundAt,
        String latestSummary,
        String latestEvidenceMarkdown,
        Long latestRunId,
        Long latestTargetId,
        Long linkedWorkItemId
) {
}
