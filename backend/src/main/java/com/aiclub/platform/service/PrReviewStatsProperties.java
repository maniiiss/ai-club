package com.aiclub.platform.service;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * PR 评审统计页面所需的 OA 默认配置。
 * OA 认证信息已收敛到环境变量管理，这里仅保留地址与默认开发组。
 */
@Component
@ConfigurationProperties(prefix = "platform.pr-review")
public class PrReviewStatsProperties {

    private String oaBaseUrl = "http://192.168.110.251:8082";
    private String defaultDevGroupName = "";

    public String getOaBaseUrl() {
        return normalize(oaBaseUrl, "");
    }

    public void setOaBaseUrl(String oaBaseUrl) {
        this.oaBaseUrl = oaBaseUrl;
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
