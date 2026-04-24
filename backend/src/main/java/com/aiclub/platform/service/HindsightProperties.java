package com.aiclub.platform.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
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

    /** 记忆事实图优先使用的项目级 bank 模板。 */
    private final String memoryFactProjectBankTemplate;

    /** 记忆事实图补充读取的共享 bank。 */
    private final String memoryFactSharedBankId;

    /** 实体图接口路径模板。 */
    private final String memoryFactEntityGraphPathTemplate;

    /** 单实体详情接口路径模板。 */
    private final String memoryFactEntityDetailPathTemplate;

    /** 事实 recall 接口路径模板。 */
    private final String memoryFactRecallPathTemplate;

    /** 记忆事实图是否启用数据库回退读取。 */
    private final boolean memoryFactDatabaseFallbackEnabled;

    /** Hindsight 数据库直连地址，供 HTTP 不可用时做只读回退。 */
    private final String memoryFactDatabaseUrl;

    /** Hindsight 数据库用户名。 */
    private final String memoryFactDatabaseUsername;

    /** Hindsight 数据库密码。 */
    private final String memoryFactDatabasePassword;

    @Autowired
    public HindsightProperties(@Value("${platform.hindsight.base-url:http://localhost:18888}") String baseUrl,
                               @Value("${platform.hindsight.api-key:}") String apiKey,
                               @Value("${platform.hindsight.bank-prefix:git-ai-club}") String bankPrefix,
                               @Value("${platform.hindsight.recall-budget:mid}") String recallBudget,
                               @Value("${platform.hindsight.timeout-seconds:30}") int timeoutSeconds,
                               @Value("${platform.hindsight.memory-fact.project-bank-template:}") String memoryFactProjectBankTemplate,
                               @Value("${platform.hindsight.memory-fact.shared-bank-id:}") String memoryFactSharedBankId,
                               @Value("${platform.hindsight.memory-fact.entity-graph-path-template:/v1/default/banks/{bankId}/entities/graph}") String memoryFactEntityGraphPathTemplate,
                               @Value("${platform.hindsight.memory-fact.entity-detail-path-template:/v1/default/banks/{bankId}/entities/{entityId}}") String memoryFactEntityDetailPathTemplate,
                               @Value("${platform.hindsight.memory-fact.recall-path-template:/v1/default/banks/{bankId}/memories/recall}") String memoryFactRecallPathTemplate,
                               @Value("${platform.hindsight.memory-fact.database-fallback-enabled:true}") boolean memoryFactDatabaseFallbackEnabled,
                               @Value("${platform.hindsight.memory-fact.database-url:jdbc:postgresql://localhost:5432/hindsight}") String memoryFactDatabaseUrl,
                               @Value("${platform.hindsight.memory-fact.database-username:${DB_USERNAME:aiclub}}") String memoryFactDatabaseUsername,
                               @Value("${platform.hindsight.memory-fact.database-password:${DB_PASSWORD:aiclub123}}") String memoryFactDatabasePassword) {
        this.baseUrl = trimTrailingSlash(baseUrl);
        this.apiKey = apiKey == null ? "" : apiKey.trim();
        this.bankPrefix = hasText(bankPrefix) ? bankPrefix.trim() : "git-ai-club";
        this.recallBudget = hasText(recallBudget) ? recallBudget.trim() : "mid";
        this.timeoutSeconds = Math.max(5, Math.min(timeoutSeconds, 120));
        this.memoryFactProjectBankTemplate = defaultString(memoryFactProjectBankTemplate);
        this.memoryFactSharedBankId = defaultString(memoryFactSharedBankId);
        this.memoryFactEntityGraphPathTemplate = hasText(memoryFactEntityGraphPathTemplate)
                ? memoryFactEntityGraphPathTemplate.trim()
                : "/v1/default/banks/{bankId}/entities/graph";
        this.memoryFactEntityDetailPathTemplate = hasText(memoryFactEntityDetailPathTemplate)
                ? memoryFactEntityDetailPathTemplate.trim()
                : "/v1/default/banks/{bankId}/entities/{entityId}";
        this.memoryFactRecallPathTemplate = hasText(memoryFactRecallPathTemplate)
                ? memoryFactRecallPathTemplate.trim()
                : "/v1/default/banks/{bankId}/memories/recall";
        this.memoryFactDatabaseFallbackEnabled = memoryFactDatabaseFallbackEnabled;
        this.memoryFactDatabaseUrl = defaultString(memoryFactDatabaseUrl);
        this.memoryFactDatabaseUsername = defaultString(memoryFactDatabaseUsername);
        this.memoryFactDatabasePassword = memoryFactDatabasePassword == null ? "" : memoryFactDatabasePassword;
    }

    /**
     * 测试用快捷构造，保持已有单元测试调用方式不变。
     */
    public HindsightProperties(String baseUrl,
                               String apiKey,
                               String bankPrefix,
                               String recallBudget,
                               int timeoutSeconds) {
        this(
                baseUrl,
                apiKey,
                bankPrefix,
                recallBudget,
                timeoutSeconds,
                "",
                "",
                "/v1/default/banks/{bankId}/entities/graph",
                "/v1/default/banks/{bankId}/entities/{entityId}",
                "/v1/default/banks/{bankId}/memories/recall",
                true,
                "jdbc:postgresql://localhost:5432/hindsight",
                "aiclub",
                "aiclub123"
        );
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

    public String getMemoryFactProjectBankTemplate() {
        return memoryFactProjectBankTemplate;
    }

    public String getMemoryFactSharedBankId() {
        return memoryFactSharedBankId;
    }

    public String getMemoryFactEntityGraphPathTemplate() {
        return memoryFactEntityGraphPathTemplate;
    }

    public String getMemoryFactEntityDetailPathTemplate() {
        return memoryFactEntityDetailPathTemplate;
    }

    public String getMemoryFactRecallPathTemplate() {
        return memoryFactRecallPathTemplate;
    }

    public boolean isMemoryFactDatabaseFallbackEnabled() {
        return memoryFactDatabaseFallbackEnabled;
    }

    public String getMemoryFactDatabaseUrl() {
        return memoryFactDatabaseUrl;
    }

    public String getMemoryFactDatabaseUsername() {
        return memoryFactDatabaseUsername;
    }

    public String getMemoryFactDatabasePassword() {
        return memoryFactDatabasePassword;
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

    /**
     * 记忆事实图默认仍优先读取项目级 bank，便于兼容当前已存在的项目 Wiki bank。
     */
    public String memoryFactProjectBankId(Long projectId) {
        String template = hasText(memoryFactProjectBankTemplate)
                ? memoryFactProjectBankTemplate
                : bankPrefix + ":wiki:project:{projectId}";
        return template
                .replace("{bankPrefix}", bankPrefix)
                .replace("{projectId}", projectId == null ? "" : String.valueOf(projectId));
    }

    /**
     * 共享 bank 只在显式配置时启用，避免运行时盲猜。
     */
    public boolean hasMemoryFactSharedBankId() {
        return hasText(memoryFactSharedBankId);
    }

    public String memoryFactSharedBankId() {
        return memoryFactSharedBankId.replace("{bankPrefix}", bankPrefix);
    }

    public String memoryFactEntityGraphUrl(String bankId) {
        return baseUrl + renderPath(memoryFactEntityGraphPathTemplate, bankId, null);
    }

    public String memoryFactEntityDetailUrl(String bankId, String entityId) {
        return baseUrl + renderPath(memoryFactEntityDetailPathTemplate, bankId, entityId);
    }

    public String memoryFactRecallUrl(String bankId) {
        return baseUrl + renderPath(memoryFactRecallPathTemplate, bankId, null);
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

    private String renderPath(String template, String bankId, String entityId) {
        String normalized = hasText(template) ? template.trim() : "";
        if (!normalized.startsWith("/")) {
            normalized = "/" + normalized;
        }
        return normalized
                .replace("{bankId}", urlEncode(bankId))
                .replace("{entityId}", urlEncode(entityId));
    }

    private String defaultString(String value) {
        return value == null ? "" : value.trim();
    }

    private String urlEncode(String value) {
        return java.net.URLEncoder.encode(defaultString(value), java.nio.charset.StandardCharsets.UTF_8);
    }
}
