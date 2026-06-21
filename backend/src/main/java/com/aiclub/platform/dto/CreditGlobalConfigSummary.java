package com.aiclub.platform.dto;

public record CreditGlobalConfigSummary(
        int registerGrantAmount,
        boolean registerGrantEnabled,
        String updatedAt
) {
}
