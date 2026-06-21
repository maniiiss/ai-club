package com.aiclub.platform.dto;

public record CreditTransactionSummary(
        Long id,
        Long userId,
        String username,
        String transactionType,
        int amount,
        int balanceAfter,
        String featureCode,
        String businessKey,
        String reason,
        Long operatorUserId,
        Long relatedTransactionId,
        String createdAt
) {
}
