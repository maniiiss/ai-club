package com.aiclub.platform.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * 可观测性中心运行参数。
 * 第一版以 application.yml + 环境变量方式托管，避免观测链路一开始就引入额外后台配置面。
 */
@Component
public class ObservabilityProperties {

    private final boolean enabled;
    private final int logChunkBytes;
    private final int logRetentionDays;
    private final int healthRetentionDays;
    private final int httpConnectTimeoutMs;
    private final int httpReadTimeoutMs;
    private final String ingestToken;

    public ObservabilityProperties(@Value("${platform.observability.enabled:true}") boolean enabled,
                                   @Value("${platform.observability.log.chunk-bytes:262144}") int logChunkBytes,
                                   @Value("${platform.observability.log.retention-days:14}") int logRetentionDays,
                                   @Value("${platform.observability.health.retention-days:30}") int healthRetentionDays,
                                   @Value("${platform.observability.health.http-connect-timeout-ms:3000}") int httpConnectTimeoutMs,
                                   @Value("${platform.observability.health.http-read-timeout-ms:5000}") int httpReadTimeoutMs,
                                   @Value("${platform.observability.ingest-token:git-ai-club-observability-token}") String ingestToken) {
        this.enabled = enabled;
        this.logChunkBytes = Math.max(4096, logChunkBytes);
        this.logRetentionDays = Math.max(1, logRetentionDays);
        this.healthRetentionDays = Math.max(1, healthRetentionDays);
        this.httpConnectTimeoutMs = Math.max(500, httpConnectTimeoutMs);
        this.httpReadTimeoutMs = Math.max(500, httpReadTimeoutMs);
        this.ingestToken = ingestToken == null || ingestToken.trim().isEmpty()
                ? "git-ai-club-observability-token"
                : ingestToken.trim();
    }

    public boolean isEnabled() {
        return enabled;
    }

    public int getLogChunkBytes() {
        return logChunkBytes;
    }

    public int getLogRetentionDays() {
        return logRetentionDays;
    }

    public int getHealthRetentionDays() {
        return healthRetentionDays;
    }

    public int getHttpConnectTimeoutMs() {
        return httpConnectTimeoutMs;
    }

    public int getHttpReadTimeoutMs() {
        return httpReadTimeoutMs;
    }

    public String getIngestToken() {
        return ingestToken;
    }
}
