package com.aiclub.platform.dto;

import java.util.List;

public record SelfUpgradePatrolRunTargetSummary(
        Long id,
        Long planTargetId,
        String targetName,
        String seedUrl,
        String status,
        String pagePath,
        Integer stepCount,
        Integer findingCount,
        Integer skippedGuardrailCount,
        String summary,
        List<SelfUpgradeArtifactLink> artifacts,
        String startedAt,
        String finishedAt
) {
}
