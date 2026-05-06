package com.aiclub.platform.dto;

/**
 * API 环境鉴权配置。
 */
public record ProjectApiEnvironmentAuthConfigSummary(
        String token,
        String username,
        String password,
        String apiKeyName,
        String apiKeyValue,
        String apiKeyLocation
) {
}
