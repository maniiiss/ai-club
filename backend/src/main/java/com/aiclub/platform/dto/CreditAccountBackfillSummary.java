package com.aiclub.platform.dto;

/**
 * 批量补建历史用户积分账户的结果摘要。
 * createdCount 为本次新开户数量，grantedCount 为发放注册积分的账户数量，grantAmount 为单账户发放积分数。
 */
public record CreditAccountBackfillSummary(
        int createdCount,
        int grantedCount,
        int grantAmount
) {
}
