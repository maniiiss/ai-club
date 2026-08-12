package com.aiclub.platform.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Work 联网研究供应商配置。密钥只保留在服务端，Desktop 和 sidecar 均不可读取。
 */
@Component
public class GitPilotWorkResearchProperties {
    private final boolean enabled;
    private final String endpoint;
    private final String apiKey;
    private final int timeoutSeconds;
    private final int maxResults;

    public GitPilotWorkResearchProperties(
            @Value("${platform.gitpilot.work.research.enabled:false}") boolean enabled,
            @Value("${platform.gitpilot.work.research.endpoint:https://api.tavily.com/search}") String endpoint,
            @Value("${platform.gitpilot.work.research.api-key:}") String apiKey,
            @Value("${platform.gitpilot.work.research.timeout-seconds:15}") int timeoutSeconds,
            @Value("${platform.gitpilot.work.research.max-results:5}") int maxResults) {
        this.enabled = enabled;
        this.endpoint = endpoint == null ? "" : endpoint.trim();
        this.apiKey = apiKey == null ? "" : apiKey.trim();
        this.timeoutSeconds = Math.max(3, Math.min(timeoutSeconds, 30));
        this.maxResults = Math.max(1, Math.min(maxResults, 8));
    }

    public boolean enabled() { return enabled; }
    public String endpoint() { return endpoint; }
    public String apiKey() { return apiKey; }
    public int timeoutSeconds() { return timeoutSeconds; }
    public int maxResults() { return maxResults; }
}
