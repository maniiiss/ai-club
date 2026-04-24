package com.aiclub.platform.dto;

import java.util.List;

public record SelfUpgradePatrolPlanSummary(
        Long id,
        String name,
        String description,
        Long environmentProfileId,
        String environmentProfileName,
        Long aiModelConfigId,
        String aiModelConfigName,
        String aiModelProvider,
        String aiModelName,
        String schedulerCron,
        boolean schedulerEnabled,
        Integer maxExplorationSteps,
        Integer targetTimeoutSeconds,
        Integer runTimeoutSeconds,
        boolean enabled,
        String lastRunStatus,
        String lastRunMessage,
        String lastRunAt,
        String lastScheduledAt,
        List<SelfUpgradePatrolTargetSummary> targets
) {
}
