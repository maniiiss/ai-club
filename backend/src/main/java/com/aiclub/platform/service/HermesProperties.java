package com.aiclub.platform.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * Hermes 平台内置助手的系统级连接配置。
 */
@Component
public class HermesProperties {

    private final String baseUrl;
    private final String apiKey;
    private final String model;
    private final int timeoutSeconds;
    private final String sessionPrefix;
    private final int maxContextMessages;
    private final int groundingTtlSeconds;
    private final PlatformEnvVarResolver platformEnvVarResolver;

    @Autowired
    public HermesProperties(@Value("${platform.hermes.base-url}") String baseUrl,
                            @Value("${platform.hermes.api-key:}") String apiKey,
                            @Value("${platform.hermes.model:hermes-agent}") String model,
                            @Value("${platform.hermes.timeout-seconds:180}") String timeoutSeconds,
                            @Value("${platform.hermes.session-prefix:ai-club:hermes}") String sessionPrefix,
                            @Value("${platform.hermes.max-context-messages:6}") int maxContextMessages,
                            @Value("${platform.hermes.grounding-ttl-seconds:86400}") int groundingTtlSeconds,
                            PlatformEnvVarResolver platformEnvVarResolver) {
        this(baseUrl, apiKey, model, timeoutSeconds, sessionPrefix, maxContextMessages, groundingTtlSeconds, platformEnvVarResolver, true);
    }

    public HermesProperties(String baseUrl,
                            String apiKey,
                            String model,
                            int timeoutSeconds,
                            String sessionPrefix,
                            int maxContextMessages,
                            int groundingTtlSeconds) {
        this(baseUrl, apiKey, model, String.valueOf(timeoutSeconds), sessionPrefix, maxContextMessages, groundingTtlSeconds, null, true);
    }

    private HermesProperties(String baseUrl,
                             String apiKey,
                             String model,
                             String timeoutSeconds,
                             String sessionPrefix,
                             int maxContextMessages,
                             int groundingTtlSeconds,
                             PlatformEnvVarResolver platformEnvVarResolver,
                             boolean normalizedConstructor) {
        this.baseUrl = trimTrailingSlash(hasText(baseUrl) ? baseUrl : "http://localhost:18080/v1");
        this.apiKey = apiKey == null ? "" : apiKey.trim();
        this.model = model == null || model.trim().isEmpty() ? "hermes-agent" : model.trim();
        this.timeoutSeconds = normalizeTimeoutSeconds(timeoutSeconds);
        this.sessionPrefix = sessionPrefix == null || sessionPrefix.trim().isEmpty() ? "ai-club:hermes" : sessionPrefix.trim();
        this.maxContextMessages = Math.max(1, Math.min(maxContextMessages, 20));
        this.groundingTtlSeconds = Math.max(300, Math.min(groundingTtlSeconds, 604800));
        this.platformEnvVarResolver = platformEnvVarResolver;
    }

    public String getBaseUrl() {
        return trimTrailingSlash(resolveOrDefault(PlatformEnvVarRegistry.KEY_HERMES_BASE_URL, baseUrl));
    }

    public String getApiKey() {
        return resolveOptional(PlatformEnvVarRegistry.KEY_HERMES_API_KEY, apiKey);
    }

    public String getModel() {
        return resolveOrDefault(PlatformEnvVarRegistry.KEY_HERMES_MODEL, model);
    }

    public int getTimeoutSeconds() {
        String resolved = resolveOrDefault(PlatformEnvVarRegistry.KEY_HERMES_TIMEOUT_SECONDS, String.valueOf(timeoutSeconds));
        return normalizeTimeoutSeconds(resolved);
    }

    public String getSessionPrefix() {
        return sessionPrefix;
    }

    public int getMaxContextMessages() {
        return maxContextMessages;
    }

    public int getGroundingTtlSeconds() {
        return groundingTtlSeconds;
    }

    /**
     * 统一去掉尾部斜杠，避免后续拼接接口路径时重复出现双斜杠。
     */
    private String trimTrailingSlash(String value) {
        String result = value == null ? "" : value.trim();
        while (result.endsWith("/")) {
            result = result.substring(0, result.length() - 1);
        }
        return result;
    }

    private String resolveOptional(String envKey, String fallback) {
        if (platformEnvVarResolver == null) {
            return fallback == null ? "" : fallback.trim();
        }
        return platformEnvVarResolver.resolveOptional(envKey, () -> fallback);
    }

    private String resolveOrDefault(String envKey, String fallback) {
        if (platformEnvVarResolver == null) {
            return fallback == null ? "" : fallback.trim();
        }
        return platformEnvVarResolver.resolveOrDefault(envKey, () -> fallback, fallback);
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private int normalizeTimeoutSeconds(String value) {
        if (!hasText(value)) {
            return 180;
        }
        try {
            return Math.max(30, Math.min(Integer.parseInt(value.trim()), 600));
        } catch (NumberFormatException exception) {
            return 180;
        }
    }
}
