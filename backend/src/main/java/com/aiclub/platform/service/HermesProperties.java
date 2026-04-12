package com.aiclub.platform.service;

import org.springframework.beans.factory.annotation.Value;
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

    public HermesProperties(@Value("${platform.hermes.base-url}") String baseUrl,
                            @Value("${platform.hermes.api-key:}") String apiKey,
                            @Value("${platform.hermes.model:hermes-agent}") String model,
                            @Value("${platform.hermes.timeout-seconds:180}") int timeoutSeconds,
                            @Value("${platform.hermes.session-prefix:ai-club:hermes}") String sessionPrefix,
                            @Value("${platform.hermes.max-context-messages:6}") int maxContextMessages,
                            @Value("${platform.hermes.grounding-ttl-seconds:86400}") int groundingTtlSeconds) {
        this.baseUrl = trimTrailingSlash(baseUrl);
        this.apiKey = apiKey == null ? "" : apiKey.trim();
        this.model = model == null || model.trim().isEmpty() ? "hermes-agent" : model.trim();
        this.timeoutSeconds = Math.max(30, Math.min(timeoutSeconds, 600));
        this.sessionPrefix = sessionPrefix == null || sessionPrefix.trim().isEmpty() ? "ai-club:hermes" : sessionPrefix.trim();
        this.maxContextMessages = Math.max(1, Math.min(maxContextMessages, 20));
        this.groundingTtlSeconds = Math.max(300, Math.min(groundingTtlSeconds, 604800));
    }

    public String getBaseUrl() {
        return baseUrl;
    }

    public String getApiKey() {
        return apiKey;
    }

    public String getModel() {
        return model;
    }

    public int getTimeoutSeconds() {
        return timeoutSeconds;
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
}
