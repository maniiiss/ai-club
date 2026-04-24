package com.aiclub.platform.dto;

public record SelfUpgradePatrolTargetSummary(
        Long id,
        String name,
        String seedUrl,
        String goalPrompt,
        String readySelector,
        boolean allowWrite,
        String writeAllowlistOverrideJson,
        Integer maxStepsOverride,
        Integer sortOrder,
        boolean enabled
) {
}
