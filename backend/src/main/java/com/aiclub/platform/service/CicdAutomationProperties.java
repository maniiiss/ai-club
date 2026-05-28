package com.aiclub.platform.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * 流水线中心自动化能力的部署级配置。
 */
@Component
public class CicdAutomationProperties {

    private final String publicBaseUrl;
    private final long runSyncFixedDelayMs;
    private final int runSyncFetchLimit;
    private final long callbackDeliveryFixedDelayMs;
    private final int callbackDeliveryMaxAttempts;

    public CicdAutomationProperties(
            @Value("${platform.cicd.public-base-url:}") String publicBaseUrl,
            @Value("${platform.cicd.run-sync.fixed-delay-ms:30000}") long runSyncFixedDelayMs,
            @Value("${platform.cicd.run-sync.fetch-limit:10}") int runSyncFetchLimit,
            @Value("${platform.cicd.callback-delivery.fixed-delay-ms:10000}") long callbackDeliveryFixedDelayMs,
            @Value("${platform.cicd.callback-delivery.max-attempts:5}") int callbackDeliveryMaxAttempts
    ) {
        this.publicBaseUrl = trimTrailingSlash(publicBaseUrl);
        this.runSyncFixedDelayMs = runSyncFixedDelayMs <= 0 ? 30000L : runSyncFixedDelayMs;
        this.runSyncFetchLimit = runSyncFetchLimit <= 0 ? 10 : Math.min(runSyncFetchLimit, 50);
        this.callbackDeliveryFixedDelayMs = callbackDeliveryFixedDelayMs <= 0 ? 10000L : callbackDeliveryFixedDelayMs;
        this.callbackDeliveryMaxAttempts = callbackDeliveryMaxAttempts <= 0 ? 5 : callbackDeliveryMaxAttempts;
    }

    /**
     * 返回外部可访问的 AI Club 公网基础地址。
     */
    public String getPublicBaseUrl() {
        return publicBaseUrl;
    }

    /**
     * 返回运行同步轮询间隔。
     */
    public long getRunSyncFixedDelayMs() {
        return runSyncFixedDelayMs;
    }

    /**
     * 返回单条流水线每轮同步抓取的运行条数上限。
     */
    public int getRunSyncFetchLimit() {
        return runSyncFetchLimit;
    }

    /**
     * 返回回调投递扫描间隔。
     */
    public long getCallbackDeliveryFixedDelayMs() {
        return callbackDeliveryFixedDelayMs;
    }

    /**
     * 返回回调投递最大重试次数。
     */
    public int getCallbackDeliveryMaxAttempts() {
        return callbackDeliveryMaxAttempts;
    }

    private String trimTrailingSlash(String value) {
        if (value == null) {
            return "";
        }
        String normalized = value.trim();
        while (normalized.endsWith("/")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        return normalized;
    }
}
