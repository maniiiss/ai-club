package com.aiclub.platform.dto;

public record AiModelConfigSummary(
        Long id,
        String name,
        String provider,
        String apiBaseUrl,
        String modelName,
        Boolean apiKeyConfigured,
        String description,
        Boolean enabled
) {
}
