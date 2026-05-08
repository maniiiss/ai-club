package com.aiclub.platform.service;

import org.springframework.beans.factory.annotation.Value;
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

    public YaadeProperties(@Value("${platform.yaade.base-url:http://localhost:9339/api/yaade/proxy}") String baseUrl,
                           @Value("${platform.yaade.admin-username:admin}") String adminUsername,
                           @Value("${platform.yaade.admin-password:password}") String adminPassword,
                           @Value("${platform.yaade.default-user-password:password}") String defaultUserPassword,
                           @Value("${platform.yaade.public-collection-name:未关联项目}") String publicCollectionName,
                           @Value("${platform.yaade.proxy-session-ttl-minutes:120}") int proxySessionTtlMinutes) {
        this.baseUrl = trimTrailingSlash(baseUrl);
        this.adminUsername = hasText(adminUsername) ? adminUsername.trim() : "admin";
        this.adminPassword = adminPassword == null ? "" : adminPassword.trim();
        this.defaultUserPassword = defaultUserPassword == null ? "" : defaultUserPassword.trim();
        this.publicCollectionName = hasText(publicCollectionName) ? publicCollectionName.trim() : "未关联项目";
        this.proxySessionTtlMinutes = Math.max(10, Math.min(proxySessionTtlMinutes, 720));
    }

    public String getBaseUrl() {
        return baseUrl;
    }

    public String getAdminUsername() {
        return adminUsername;
    }

    public String getAdminPassword() {
        return adminPassword;
    }

    public String getDefaultUserPassword() {
        return defaultUserPassword;
    }

    public String getPublicCollectionName() {
        return publicCollectionName;
    }

    public int getProxySessionTtlMinutes() {
        return proxySessionTtlMinutes;
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
}
