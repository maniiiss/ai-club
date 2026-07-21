package com.aiclub.platform.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * GitPilot CLI 首版设备授权和平台代理限制。
 * 业务意图：把 CLI 的短期凭据生命周期和请求边界集中配置，避免散落在控制器中。
 */
@Component
public class GitPilotCliProperties {

    private final boolean enabled;
    private final int deviceCodeTtlSeconds;
    private final int pollIntervalSeconds;
    private final int tokenTtlDays;
    private final int modelSessionTtlSeconds;
    private final int modelProxyTimeoutSeconds;
    private final int modelProxyMaxRequestBytes;
    private final String publicBaseUrl;

    public GitPilotCliProperties(
            @Value("${platform.gitpilot.cli.enabled:true}") boolean enabled,
            @Value("${platform.gitpilot.cli.device-code-ttl-seconds:600}") int deviceCodeTtlSeconds,
            @Value("${platform.gitpilot.cli.poll-interval-seconds:5}") int pollIntervalSeconds,
            @Value("${platform.gitpilot.cli.token-ttl-days:30}") int tokenTtlDays,
            @Value("${platform.gitpilot.cli.model-session-ttl-seconds:900}") int modelSessionTtlSeconds,
            @Value("${platform.gitpilot.cli.model-proxy-timeout-seconds:180}") int modelProxyTimeoutSeconds,
            @Value("${platform.gitpilot.cli.model-proxy-max-request-bytes:4194304}") int modelProxyMaxRequestBytes,
            @Value("${platform.gitpilot.cli.public-base-url:}") String publicBaseUrl) {
        this.enabled = enabled;
        this.deviceCodeTtlSeconds = clamp(deviceCodeTtlSeconds, 60, 1800);
        this.pollIntervalSeconds = clamp(pollIntervalSeconds, 1, 30);
        this.tokenTtlDays = clamp(tokenTtlDays, 1, 90);
        this.modelSessionTtlSeconds = clamp(modelSessionTtlSeconds, 60, 3600);
        this.modelProxyTimeoutSeconds = clamp(modelProxyTimeoutSeconds, 30, 600);
        this.modelProxyMaxRequestBytes = clamp(modelProxyMaxRequestBytes, 65536, 16777216);
        this.publicBaseUrl = publicBaseUrl == null ? "" : publicBaseUrl.trim().replaceFirst("/+$", "");
    }

    public boolean enabled() { return enabled; }
    public int deviceCodeTtlSeconds() { return deviceCodeTtlSeconds; }
    public int pollIntervalSeconds() { return pollIntervalSeconds; }
    public int tokenTtlDays() { return tokenTtlDays; }
    public int modelSessionTtlSeconds() { return modelSessionTtlSeconds; }
    public int modelProxyTimeoutSeconds() { return modelProxyTimeoutSeconds; }
    public int modelProxyMaxRequestBytes() { return modelProxyMaxRequestBytes; }
    public String publicBaseUrl() { return publicBaseUrl; }

    private int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }
}
