package com.aiclub.platform.dto;

import java.math.BigDecimal;

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
        BigDecimal cachedInputCreditPer1k
) {
}
