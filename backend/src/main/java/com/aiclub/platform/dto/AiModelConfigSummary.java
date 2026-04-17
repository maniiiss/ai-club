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
        Boolean apiKeyConfigured,
        String description,
        Boolean enabled
) {
}
