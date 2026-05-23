package com.aiclub.platform.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * AI Club 内置 Woodpecker provider 的部署级连接配置。
 */
@Component
public class WoodpeckerPipelineProperties {

    private final boolean enabled;
    private final String internalBaseUrl;
    private final String publicBaseUrl;
    private final String apiToken;
    private final int timeoutSeconds;

    public WoodpeckerPipelineProperties(@Value("${platform.woodpecker.enabled:true}") boolean enabled,
                                        @Value("${platform.woodpecker.internal-base-url:http://localhost:18000}") String internalBaseUrl,
                                        @Value("${platform.woodpecker.public-base-url:}") String publicBaseUrl,
                                        @Value("${platform.woodpecker.api-token:}") String apiToken,
                                        @Value("${platform.woodpecker.timeout-seconds:20}") String timeoutSeconds) {
        this.enabled = enabled;
        this.internalBaseUrl = trimTrailingSlash(internalBaseUrl);
        this.publicBaseUrl = trimTrailingSlash(hasText(publicBaseUrl) ? publicBaseUrl : internalBaseUrl);
        this.apiToken = apiToken == null ? "" : apiToken.trim();
        this.timeoutSeconds = normalizeTimeoutSeconds(timeoutSeconds);
    }

    public boolean isEnabled() {
        return enabled;
    }

    public String getInternalBaseUrl() {
        return internalBaseUrl;
    }

    public String getPublicBaseUrl() {
        return publicBaseUrl;
    }

    public String getApiToken() {
        return apiToken;
    }

    public int getTimeoutSeconds() {
        return timeoutSeconds;
    }

    public boolean isConfigured() {
        return enabled && hasText(internalBaseUrl) && hasText(apiToken);
    }

    public String apiBaseUrl() {
        String baseUrl = trimTrailingSlash(internalBaseUrl);
        if (baseUrl.endsWith("/api")) {
            return baseUrl;
        }
        return baseUrl + "/api";
    }

    public String publicPipelineUrl(String repoFullName, Integer runNumber) {
        if (!hasText(publicBaseUrl) || !hasText(repoFullName) || runNumber == null) {
            return null;
        }
        return trimTrailingSlash(publicBaseUrl) + "/repos/" + repoFullName.trim() + "/pipeline/" + runNumber;
    }

    private String trimTrailingSlash(String value) {
        String result = value == null ? "" : value.trim();
        while (result.endsWith("/")) {
            result = result.substring(0, result.length() - 1);
        }
        return result;
    }

    private int normalizeTimeoutSeconds(String value) {
        if (!hasText(value)) {
            return 20;
        }
        try {
            return Math.max(5, Math.min(Integer.parseInt(value.trim()), 120));
        } catch (NumberFormatException exception) {
            return 20;
        }
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }
}
