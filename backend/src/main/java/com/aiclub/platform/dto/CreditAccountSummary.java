package com.aiclub.platform.dto;

public record CreditAccountSummary(
        Long userId,
        String username,
        String nickname,
        int balance,
        int totalGranted,
        int totalConsumed,
        int totalRefunded,
        String updatedAt
) {
}
