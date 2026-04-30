package com.aiclub.platform.dto;

public record GiteeTestPlanPushContextSummary(
        Long testPlanId,
        boolean pushable,
        String disabledReason,
        Long remoteTestPlanId,
        String lastPushStatus,
        String lastPushMessage,
        String lastPushedAt
) {
}
