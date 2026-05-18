package com.aiclub.platform.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * Yaade 独立部署连接配置。
 */
@Component
public class YaadeProperties {

    private final String baseUrl;
    private final String adminUsername;
    private final String adminPassword;
    private final String defaultUserPassword;
    private final String publicCollectionName;
    private final int proxySessionTtlMinutes;
    private final PlatformEnvVarResolver platformEnvVarResolver;

    @Autowired
    public YaadeProperties(@Value("${platform.yaade.base-url:http://localhost:9339/api/yaade/proxy}") String baseUrl,
                           @Value("${platform.yaade.admin-username:admin}") String adminUsername,
                           @Value("${platform.yaade.admin-password:password}") String adminPassword,
                           @Value("${platform.yaade.default-user-password:password}") String defaultUserPassword,
                           @Value("${platform.yaade.public-collection-name:未关联项目}") String publicCollectionName,
                           @Value("${platform.yaade.proxy-session-ttl-minutes:120}") String proxySessionTtlMinutes,
                           PlatformEnvVarResolver platformEnvVarResolver) {
        this(baseUrl, adminUsername, adminPassword, defaultUserPassword, publicCollectionName, proxySessionTtlMinutes, platformEnvVarResolver, true);
    }

    public YaadeProperties(String baseUrl,
                           String adminUsername,
                           String adminPassword,
                           String defaultUserPassword,
                           String publicCollectionName,
                           int proxySessionTtlMinutes) {
        this(baseUrl, adminUsername, adminPassword, defaultUserPassword, publicCollectionName, String.valueOf(proxySessionTtlMinutes), null, true);
    }

    private YaadeProperties(String baseUrl,
                            String adminUsername,
                            String adminPassword,
                            String defaultUserPassword,
                            String publicCollectionName,
                            String proxySessionTtlMinutes,
                            PlatformEnvVarResolver platformEnvVarResolver,
                            boolean normalizedConstructor) {
        this.baseUrl = trimTrailingSlash(hasText(baseUrl) ? baseUrl : "http://localhost:9339/api/yaade/proxy");
        this.adminUsername = hasText(adminUsername) ? adminUsername.trim() : "admin";
        this.adminPassword = adminPassword == null ? "" : adminPassword.trim();
        this.defaultUserPassword = defaultUserPassword == null ? "" : defaultUserPassword.trim();
        this.publicCollectionName = hasText(publicCollectionName) ? publicCollectionName.trim() : "未关联项目";
        this.proxySessionTtlMinutes = normalizeProxySessionTtlMinutes(proxySessionTtlMinutes);
        this.platformEnvVarResolver = platformEnvVarResolver;
    }

    public String getBaseUrl() {
        return trimTrailingSlash(resolveOrDefault(PlatformEnvVarRegistry.KEY_YAADE_BASE_URL, baseUrl));
    }

    public String getAdminUsername() {
        return resolveOrDefault(PlatformEnvVarRegistry.KEY_YAADE_ADMIN_USERNAME, adminUsername);
    }

    public String getAdminPassword() {
        return resolveOrDefault(PlatformEnvVarRegistry.KEY_YAADE_ADMIN_PASSWORD, adminPassword);
    }

    public String getDefaultUserPassword() {
        return defaultUserPassword == null ? "" : defaultUserPassword.trim();
    }

    public String getPublicCollectionName() {
        return resolveOrDefault(PlatformEnvVarRegistry.KEY_YAADE_PUBLIC_COLLECTION_NAME, publicCollectionName);
    }

    public int getProxySessionTtlMinutes() {
        String resolved = resolveOrDefault(PlatformEnvVarRegistry.KEY_YAADE_PROXY_SESSION_TTL_MINUTES, String.valueOf(proxySessionTtlMinutes));
        try {
            return Math.max(10, Math.min(Integer.parseInt(resolved), 720));
        } catch (NumberFormatException exception) {
            return proxySessionTtlMinutes;
        }
    }

    /**
     * Yaade 公共空间 group 名称固定为平台受控值，避免与人工创建的分组串用。
     */
    public String getPublicGroupName() {
        return "aiclub-api-public";
    }

    /**
     * 项目 collection group 名称使用稳定编码，避免项目重命名后权限组漂移。
     */
    public String projectGroupName(Long projectId) {
        return "aiclub-project-" + projectId;
    }

    /**
     * 平台代登模式下，Yaade 用户名只依赖平台用户 ID，避免昵称改动影响绑定。
     */
    public String managedUsername(Long userId) {
        return "aiclub-" + userId;
    }

    private String trimTrailingSlash(String value) {
        String result = value == null ? "" : value.trim();
        while (result.endsWith("/")) {
            result = result.substring(0, result.length() - 1);
        }
        return result;
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private String resolveOrDefault(String envKey, String fallback) {
        if (platformEnvVarResolver == null) {
            return fallback == null ? "" : fallback.trim();
        }
        return platformEnvVarResolver.resolveOrDefault(envKey, () -> fallback, fallback);
    }

    private int normalizeProxySessionTtlMinutes(String value) {
        if (!hasText(value)) {
            return 120;
        }
        try {
            return Math.max(10, Math.min(Integer.parseInt(value.trim()), 720));
        } catch (NumberFormatException exception) {
            return 120;
        }
    }
}
