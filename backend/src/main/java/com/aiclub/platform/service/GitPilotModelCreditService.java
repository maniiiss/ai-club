package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.AiModelConfigEntity;
import com.aiclub.platform.domain.model.CreditFeatureConfigEntity;
import org.springframework.stereotype.Service;

/**
 * GitPilot CLI 模型调用的单次 token 计费服务。
 *
 * <p>CLI 每次模型调用（stream）为独立请求、usage 完全可知，因此按实际 token 即时扣费。
 * 模型未启用计费（{@code token_billing_enabled=false} 或单价缺失）时返回 0，不扣费、行为同现状；
 * 启用计费时复用 {@link ModelPricingService} 换算积分并用 {@link CreditService} 扣费。
 */
@Service
public class GitPilotModelCreditService {

    private final ModelPricingService modelPricingService;
    private final CreditService creditService;

    public GitPilotModelCreditService(ModelPricingService modelPricingService, CreditService creditService) {
        this.modelPricingService = modelPricingService;
        this.creditService = creditService;
    }

    /**
     * 判断模型是否启用 token 计费，供代理转发前余额门槛预检使用。
     */
    public boolean isTokenBillingEnabled(Long modelConfigId) {
        return modelPricingService.isTokenBillingEnabled(modelConfigId);
    }

    /**
     * 为一次 CLI 模型调用按实际 token 计费并扣减积分。
     *
     * @param userId       调用用户 ID
     * @param modelConfigId 模型配置 ID
     * @param sessionId    本次调用的模型会话 ID（用于构造幂等 businessKey）
     * @param prompt       输入 token 数
     * @param completion   输出 token 数
     * @param cached       缓存命中输入 token 数
     * @return 本次调用应扣积分数；模型未启用计费时返回 0
     */
    public int chargeForModelCall(Long userId, Long modelConfigId, String sessionId,
                                  Integer prompt, Integer completion, Integer cached) {
        if (!modelPricingService.isTokenBillingEnabled(modelConfigId)) {
            return 0;
        }
        CreditFeatureConfigEntity feature = creditService.requireEnabledFeatureConfig(AgentCreditService.FEATURE_AGENT_TOKEN);
        AiModelConfigEntity model = modelPricingService.requireTokenBillingModel(modelConfigId);
        int cost = modelPricingService.calculateCost(model, prompt, completion, cached);
        if (cost > 0) {
            String businessKey = "cli-model:" + userId + ":" + safeSession(sessionId) + ":" + System.currentTimeMillis();
            creditService.consume(userId, feature, cost, businessKey, "GitPilot CLI 模型调用");
        }
        return cost;
    }

    private static String safeSession(String sessionId) {
        return sessionId == null || sessionId.isBlank() ? "anonymous" : sessionId.trim();
    }
}