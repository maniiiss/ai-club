package com.aiclub.platform.service;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * PR 评审统计页面所需的 OA 默认配置。
 * 统一收敛默认地址与预填认证信息，避免前后端分别维护一份硬编码。
 */
@Component
@ConfigurationProperties(prefix = "platform.pr-review")
public class PrReviewStatsProperties {

    private String oaBaseUrl = "http://192.168.110.251:8082";
    private String defaultToken = "";
    private String defaultUserId = "";
    private String defaultDevGroupName = "";

    public String getOaBaseUrl() {
        return normalize(oaBaseUrl, "http://192.168.110.251:8082");
    }

    public void setOaBaseUrl(String oaBaseUrl) {
        this.oaBaseUrl = oaBaseUrl;
    }

    public String getDefaultToken() {
        return normalize(defaultToken, "");
    }

    public void setDefaultToken(String defaultToken) {
        this.defaultToken = defaultToken;
    }

    public String getDefaultUserId() {
        return normalize(defaultUserId, "");
    }

    public void setDefaultUserId(String defaultUserId) {
        this.defaultUserId = defaultUserId;
    }

    public String getDefaultDevGroupName() {
        return normalize(defaultDevGroupName, "");
    }

    public void setDefaultDevGroupName(String defaultDevGroupName) {
        this.defaultDevGroupName = defaultDevGroupName;
    }

    private String normalize(String value, String defaultValue) {
        if (value == null) {
            return defaultValue;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? defaultValue : trimmed;
    }
}
