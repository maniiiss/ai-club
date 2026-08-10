package com.aiclub.platform.dto;

/**
 * 智能体执行按模型聚合的 token 用量，供 ModelPricingService 计算积分成本。
 *
 * <p>modelConfigId 为空（系统内部调用未绑定模型）时聚合到 0 组，按对应模型定价计算。
 */
public record AgentTokenUsage(
        Long modelConfigId,
        Long promptTokens,
        Long completionTokens,
        Long cachedTokens) {
}
