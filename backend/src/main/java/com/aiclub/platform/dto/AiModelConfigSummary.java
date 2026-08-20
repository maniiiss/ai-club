package com.aiclub.platform.dto;

import java.math.BigDecimal;
import java.util.List;

public record AiModelConfigSummary(
        Long id,
        String name,
        /**
         * 模型用途类型，前端据此决定展示和下游可绑定范围。
         */
        String modelType,
        String provider,
        String apiBaseUrl,
        String modelName,
        /**
         * OpenAI 兼容模型的调用模式，前端可据此减少不必要的探测请求。
         */
        String openaiApiMode,
        Boolean apiKeyConfigured,
        String description,
        Boolean enabled,
        /**
         * 模型上下文窗口长度（token），CLI 据此展示与判断自动压缩阈值。
         */
        Integer contextLength,
        /**
         * 模型最大输出 token 数。
         */
        Integer maxOutputTokens,
        /**
         * 是否对该模型启用 token 计费（灰度开关）。
         */
        Boolean tokenBillingEnabled,
        /** 相对平台 1x 基准价的模型倍率；未启用或无完整计费配置时为空。 */
        BigDecimal billingMultiplier,
        /**
         * 每千输入 token 积分单价。
         */
        BigDecimal inputCreditPer1k,
        /**
         * 每千输出 token 积分单价。
         */
        BigDecimal outputCreditPer1k,
        /**
         * 每千缓存命中输入 token 单价；为空时按输入单价 ×0.5 兜底。
         */
        BigDecimal cachedInputCreditPer1k,
        /** 平台归一化后的输入模态列表，供管理端展示和 CLI 映射到 PI Model.input。 */
        List<String> inputModalities,
        /** 声明上游支持 vision（如经过 9router 代理）；为 true 时 CLI 在 inputModalities 不含 image 时仍内联图片。 */
        Boolean visionRouting
) {
    /** 兼容新增输入能力字段前的调用方，旧模型默认仅支持文本输入。 */
    public AiModelConfigSummary(
            Long id,
            String name,
            String modelType,
            String provider,
            String apiBaseUrl,
            String modelName,
            String openaiApiMode,
            Boolean apiKeyConfigured,
            String description,
            Boolean enabled,
            Integer contextLength,
            Integer maxOutputTokens,
            Boolean tokenBillingEnabled,
            BigDecimal inputCreditPer1k,
            BigDecimal outputCreditPer1k,
            BigDecimal cachedInputCreditPer1k
    ) {
        this(id, name, modelType, provider, apiBaseUrl, modelName, openaiApiMode, apiKeyConfigured, description,
                enabled, contextLength, maxOutputTokens, tokenBillingEnabled, null, inputCreditPer1k,
                outputCreditPer1k, cachedInputCreditPer1k, List.of("text"), Boolean.FALSE);
    }

    /** 兼容已增加输入模态但尚未增加倍率字段的调用方。 */
    public AiModelConfigSummary(
            Long id,
            String name,
            String modelType,
            String provider,
            String apiBaseUrl,
            String modelName,
            String openaiApiMode,
            Boolean apiKeyConfigured,
            String description,
            Boolean enabled,
            Integer contextLength,
            Integer maxOutputTokens,
            Boolean tokenBillingEnabled,
            BigDecimal inputCreditPer1k,
            BigDecimal outputCreditPer1k,
            BigDecimal cachedInputCreditPer1k,
            List<String> inputModalities
    ) {
        this(id, name, modelType, provider, apiBaseUrl, modelName, openaiApiMode, apiKeyConfigured, description,
                enabled, contextLength, maxOutputTokens, tokenBillingEnabled, null, inputCreditPer1k,
                outputCreditPer1k, cachedInputCreditPer1k, inputModalities, Boolean.FALSE);
    }

    /** 兼容已增加输入模态但尚未增加 visionRouting 字段的调用方。 */
    public AiModelConfigSummary(
            Long id,
            String name,
            String modelType,
            String provider,
            String apiBaseUrl,
            String modelName,
            String openaiApiMode,
            Boolean apiKeyConfigured,
            String description,
            Boolean enabled,
            Integer contextLength,
            Integer maxOutputTokens,
            Boolean tokenBillingEnabled,
            BigDecimal billingMultiplier,
            BigDecimal inputCreditPer1k,
            BigDecimal outputCreditPer1k,
            BigDecimal cachedInputCreditPer1k,
            List<String> inputModalities
    ) {
        this(id, name, modelType, provider, apiBaseUrl, modelName, openaiApiMode, apiKeyConfigured, description,
                enabled, contextLength, maxOutputTokens, tokenBillingEnabled, billingMultiplier, inputCreditPer1k,
                outputCreditPer1k, cachedInputCreditPer1k, inputModalities, Boolean.FALSE);
    }
}
