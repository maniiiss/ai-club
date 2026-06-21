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
        Boolean enabled
) {
}
