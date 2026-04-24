package com.aiclub.platform.dto;

import java.util.List;

public record SelfUpgradeSuggestionOccurrenceSummary(
        Long id,
        Long runId,
        Long runTargetId,
        String foundAt,
        String evidenceMarkdown,
        List<SelfUpgradeArtifactLink> artifacts,
        String pagePath,
        String domHintJson
) {
}
