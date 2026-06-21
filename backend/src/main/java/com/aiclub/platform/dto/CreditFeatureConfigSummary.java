package com.aiclub.platform.dto;

public record CreditFeatureConfigSummary(
        Long id,
        String featureCode,
        String featureName,
        int costAmount,
        boolean enabled,
        String updatedAt
) {
}
