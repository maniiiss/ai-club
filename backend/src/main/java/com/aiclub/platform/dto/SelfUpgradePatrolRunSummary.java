package com.aiclub.platform.dto;

import java.util.List;

public record SelfUpgradePatrolRunSummary(
        Long id,
        Long planId,
        String planName,
        Long environmentProfileId,
        String environmentProfileName,
        String status,
        String triggerMode,
        Long linkedExecutionTaskId,
        Integer totalTargetCount,
        Integer successTargetCount,
        Integer partialSuccessTargetCount,
        Integer failedTargetCount,
        Integer suggestionCount,
        Integer openedSuggestionCount,
        Integer reopenedSuggestionCount,
        String summary,
        Long createdByUserId,
        String createdByName,
        String startedAt,
        String finishedAt,
        String createdAt,
        List<SelfUpgradePatrolRunTargetSummary> targets
) {
}
