package com.aiclub.platform.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.List;
import java.util.Locale;

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
    private final boolean cloudCodingEnabled;
    private final boolean cloudCodingCliEnabled;
    private final String cloudCodingWorkerMode;
    private final List<String> cloudCodingForbiddenFileGlobs;
    private final int cloudCodingMaxActiveSessionsPerUser;
    private final int cloudCodingWorkspaceTtlHours;

    @Autowired
    public GitPilotCliProperties(
            @Value("${platform.gitpilot.cli.enabled:true}") boolean enabled,
            @Value("${platform.gitpilot.cli.device-code-ttl-seconds:600}") int deviceCodeTtlSeconds,
            @Value("${platform.gitpilot.cli.poll-interval-seconds:5}") int pollIntervalSeconds,
            @Value("${platform.gitpilot.cli.token-ttl-days:30}") int tokenTtlDays,
            @Value("${platform.gitpilot.cli.model-session-ttl-seconds:900}") int modelSessionTtlSeconds,
            @Value("${platform.gitpilot.cli.model-proxy-timeout-seconds:180}") int modelProxyTimeoutSeconds,
            @Value("${platform.gitpilot.cli.model-proxy-max-request-bytes:4194304}") int modelProxyMaxRequestBytes,
            @Value("${platform.gitpilot.cli.public-base-url:}") String publicBaseUrl,
            @Value("${platform.cloud-coding.enabled:false}") boolean cloudCodingEnabled,
            @Value("${platform.cloud-coding.cli-enabled:false}") boolean cloudCodingCliEnabled,
            @Value("${platform.cloud-coding.worker-mode:LOCAL_PROCESS}") String cloudCodingWorkerMode,
            @Value("${platform.cloud-coding.forbidden-file-globs:.env,.env.*,**/*.pem,**/*.key,**/*.p12,**/*.pfx}") String cloudCodingForbiddenFileGlobs,
            @Value("${platform.cloud-coding.max-active-sessions-per-user:3}") int cloudCodingMaxActiveSessionsPerUser,
            @Value("${platform.cloud-coding.workspace-ttl-hours:24}") int cloudCodingWorkspaceTtlHours) {
        this.enabled = enabled;
        this.deviceCodeTtlSeconds = clamp(deviceCodeTtlSeconds, 60, 1800);
        this.pollIntervalSeconds = clamp(pollIntervalSeconds, 1, 30);
        this.tokenTtlDays = clamp(tokenTtlDays, 1, 90);
        this.modelSessionTtlSeconds = clamp(modelSessionTtlSeconds, 60, 3600);
        this.modelProxyTimeoutSeconds = clamp(modelProxyTimeoutSeconds, 30, 600);
        this.modelProxyMaxRequestBytes = clamp(modelProxyMaxRequestBytes, 65536, 16777216);
        this.publicBaseUrl = publicBaseUrl == null ? "" : publicBaseUrl.trim().replaceFirst("/+$", "");
        this.cloudCodingEnabled = cloudCodingEnabled;
        this.cloudCodingCliEnabled = cloudCodingCliEnabled;
        this.cloudCodingWorkerMode = normalizeWorkerMode(cloudCodingWorkerMode);
        this.cloudCodingForbiddenFileGlobs = parseGlobs(cloudCodingForbiddenFileGlobs);
        this.cloudCodingMaxActiveSessionsPerUser = clamp(cloudCodingMaxActiveSessionsPerUser, 1, 20);
        this.cloudCodingWorkspaceTtlHours = clamp(cloudCodingWorkspaceTtlHours, 1, 168);
        if ((cloudCodingEnabled || cloudCodingCliEnabled) && !"CONTAINER".equals(this.cloudCodingWorkerMode)) {
            throw new IllegalStateException("Cloud Coding 对公众启用时必须使用 CONTAINER Worker");
        }
    }

    /** 保留旧构造入口，避免既有单元测试和私有部署扩展在新增 P0 配置时失效。 */
    public GitPilotCliProperties(boolean enabled,
                                 int deviceCodeTtlSeconds,
                                 int pollIntervalSeconds,
                                 int tokenTtlDays,
                                 int modelSessionTtlSeconds,
                                 int modelProxyTimeoutSeconds,
                                 int modelProxyMaxRequestBytes,
                                 String publicBaseUrl) {
        this(enabled, deviceCodeTtlSeconds, pollIntervalSeconds, tokenTtlDays, modelSessionTtlSeconds,
                modelProxyTimeoutSeconds, modelProxyMaxRequestBytes, publicBaseUrl, false, false,
                "LOCAL_PROCESS", ".env,.env.*,**/*.pem,**/*.key,**/*.p12,**/*.pfx", 3, 24);
    }

    public boolean enabled() { return enabled; }
    public int deviceCodeTtlSeconds() { return deviceCodeTtlSeconds; }
    public int pollIntervalSeconds() { return pollIntervalSeconds; }
    public int tokenTtlDays() { return tokenTtlDays; }
    public int modelSessionTtlSeconds() { return modelSessionTtlSeconds; }
    public int modelProxyTimeoutSeconds() { return modelProxyTimeoutSeconds; }
    public int modelProxyMaxRequestBytes() { return modelProxyMaxRequestBytes; }
    public String publicBaseUrl() { return publicBaseUrl; }
    public boolean cloudCodingEnabled() { return cloudCodingEnabled; }
    public boolean cloudCodingCliEnabled() { return cloudCodingCliEnabled; }
    public String cloudCodingWorkerMode() { return cloudCodingWorkerMode; }
    public List<String> cloudCodingForbiddenFileGlobs() { return cloudCodingForbiddenFileGlobs; }
    public int cloudCodingMaxActiveSessionsPerUser() { return cloudCodingMaxActiveSessionsPerUser; }
    public int cloudCodingWorkspaceTtlHours() { return cloudCodingWorkspaceTtlHours; }

    private int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }

    private String normalizeWorkerMode(String value) {
        String normalized = value == null ? "LOCAL_PROCESS" : value.trim().toUpperCase(Locale.ROOT);
        if (!"LOCAL_PROCESS".equals(normalized) && !"CONTAINER".equals(normalized)) {
            throw new IllegalArgumentException("不支持的 Cloud Coding Worker 模式: " + value);
        }
        return normalized;
    }

    private List<String> parseGlobs(String value) {
        return List.copyOf(Arrays.stream((value == null ? "" : value).split(","))
                .map(String::trim)
                .filter(item -> !item.isBlank())
                .toList());
    }
}
