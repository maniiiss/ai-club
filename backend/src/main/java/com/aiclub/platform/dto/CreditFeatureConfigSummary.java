package com.aiclub.platform.dto;

public record CreditFeatureConfigSummary(
        Long id,
        String featureCode,
        String featureName,
        int costAmount,
        boolean enabled,
        String updatedAt,
        /**
         * 计费模式：FIXED 固定积分 / TOKEN_BASED 按 token 计费（如 AGENT_TOKEN，cost_amount 为占位 0）。
         */
        String chargeMode
) {
}
