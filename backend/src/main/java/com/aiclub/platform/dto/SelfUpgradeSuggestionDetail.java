package com.aiclub.platform.dto;

import java.util.List;

public record SelfUpgradeSuggestionDetail(
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
        Long linkedWorkItemId,
        List<SelfUpgradeSuggestionOccurrenceSummary> occurrences,
        SelfUpgradeWorkItemSummary workItem
) {
}
