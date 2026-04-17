package com.aiclub.platform.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Hindsight 记忆检索服务连接配置，供 Wiki 语义索引和召回使用。
 */
@Component
public class HindsightProperties {

    /** Hindsight API 基础地址。 */
    private final String baseUrl;

    /** Hindsight API Key，本地默认允许为空。 */
    private final String apiKey;

    /** Wiki 专用 bank 前缀，最终会按项目继续隔离。 */
    private final String bankPrefix;

    /** recall 调用时使用的检索预算。 */
    private final String recallBudget;

    /** Hindsight HTTP 请求超时时间。 */
    private final int timeoutSeconds;

    public HindsightProperties(@Value("${platform.hindsight.base-url:http://localhost:18888}") String baseUrl,
                               @Value("${platform.hindsight.api-key:}") String apiKey,
                               @Value("${platform.hindsight.bank-prefix:git-ai-club}") String bankPrefix,
                               @Value("${platform.hindsight.recall-budget:mid}") String recallBudget,
                               @Value("${platform.hindsight.timeout-seconds:30}") int timeoutSeconds) {
        this.baseUrl = trimTrailingSlash(baseUrl);
        this.apiKey = apiKey == null ? "" : apiKey.trim();
        this.bankPrefix = hasText(bankPrefix) ? bankPrefix.trim() : "git-ai-club";
        this.recallBudget = hasText(recallBudget) ? recallBudget.trim() : "mid";
        this.timeoutSeconds = Math.max(5, Math.min(timeoutSeconds, 120));
    }

    public String getBaseUrl() {
        return baseUrl;
    }

    public String getApiKey() {
        return apiKey;
    }

    public String getBankPrefix() {
        return bankPrefix;
    }

    public String getRecallBudget() {
        return recallBudget;
    }

    public int getTimeoutSeconds() {
        return timeoutSeconds;
    }

    /**
     * 根据项目 ID 生成独立 bank，避免跨项目语义召回串数据。
     */
    public String wikiBankId(Long projectId) {
        return bankPrefix + ":wiki:project:" + projectId;
    }

    /**
     * 根据空间 ID 生成独立 bank，避免跨空间语义召回串数据。
     */
    public String wikiSpaceBankId(Long spaceId) {
        return bankPrefix + ":wiki:space:" + spaceId;
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
