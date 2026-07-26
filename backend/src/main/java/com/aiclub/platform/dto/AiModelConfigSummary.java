package com.aiclub.platform.dto;

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
        Integer maxOutputTokens
) {
}
