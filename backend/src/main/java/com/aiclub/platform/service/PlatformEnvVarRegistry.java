package com.aiclub.platform.service;

import org.springframework.stereotype.Component;

import java.net.URI;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Set;
import java.util.function.Function;

/**
 * 固定环境变量注册表。
 * 用代码约束可管理 Key、运行时属性映射与取值校验规则，避免后台演化成任意键值中心。
 */
@Component
public class PlatformEnvVarRegistry {

    public static final String KEY_GITEE_BINDING_ENTERPRISE_ID = "PLATFORM_GITEE_BINDING_ENTERPRISE_ID";
    public static final String KEY_GITEE_BINDING_ACCESS_TOKEN = "PLATFORM_GITEE_BINDING_ACCESS_TOKEN";
    public static final String KEY_GITEE_DEFAULT_API_URL = "PLATFORM_GITEE_DEFAULT_API_URL";
    public static final String KEY_GITEE_TEST_PUSH_TEST_PLAN_ASSIGNEE_ID = "PLATFORM_GITEE_TEST_PUSH_TEST_PLAN_ASSIGNEE_ID";
    public static final String KEY_GITEE_TEST_PUSH_TEST_CASE_MODULE_ID = "PLATFORM_GITEE_TEST_PUSH_TEST_CASE_MODULE_ID";
    public static final String KEY_GITEE_TEST_PUSH_TEST_CASE_TYPE = "PLATFORM_GITEE_TEST_PUSH_TEST_CASE_TYPE";
    public static final String KEY_GITLAB_DEFAULT_API_URL = "PLATFORM_GITLAB_DEFAULT_API_URL";
    public static final String KEY_GITLAB_OAUTH_CLIENT_ID = "PLATFORM_GITLAB_OAUTH_CLIENT_ID";
    public static final String KEY_GITLAB_OAUTH_CLIENT_SECRET = "PLATFORM_GITLAB_OAUTH_CLIENT_SECRET";
    public static final String KEY_GITLAB_OAUTH_REDIRECT_URI = "PLATFORM_GITLAB_OAUTH_REDIRECT_URI";
    public static final String KEY_PR_REVIEW_OA_BASE_URL = "PLATFORM_PR_REVIEW_OA_BASE_URL";
    public static final String KEY_PR_REVIEW_DEFAULT_DEV_GROUP_NAME = "PLATFORM_PR_REVIEW_DEFAULT_DEV_GROUP_NAME";
    public static final String KEY_PR_REVIEW_OA_USER_ID = "PLATFORM_PR_REVIEW_OA_USER_ID";
    public static final String KEY_PR_REVIEW_OA_TOKEN = "PLATFORM_PR_REVIEW_OA_TOKEN";
    public static final String KEY_YAADE_BASE_URL = "PLATFORM_YAADE_BASE_URL";
    public static final String KEY_YAADE_ADMIN_USERNAME = "PLATFORM_YAADE_ADMIN_USERNAME";
    public static final String KEY_YAADE_ADMIN_PASSWORD = "PLATFORM_YAADE_ADMIN_PASSWORD";
    public static final String KEY_YAADE_DEFAULT_USER_PASSWORD = "PLATFORM_YAADE_DEFAULT_USER_PASSWORD";
    public static final String KEY_YAADE_PUBLIC_COLLECTION_NAME = "PLATFORM_YAADE_PUBLIC_COLLECTION_NAME";
    public static final String KEY_YAADE_PROXY_SESSION_TTL_MINUTES = "PLATFORM_YAADE_PROXY_SESSION_TTL_MINUTES";
    public static final String KEY_HERMES_BASE_URL = "PLATFORM_HERMES_BASE_URL";
    public static final String KEY_HERMES_API_KEY = "PLATFORM_HERMES_API_KEY";
    public static final String KEY_HERMES_MODEL = "PLATFORM_HERMES_MODEL";
    public static final String KEY_HERMES_TIMEOUT_SECONDS = "PLATFORM_HERMES_TIMEOUT_SECONDS";
    public static final String KEY_HERMES_SPEECH_BASE_URL = "PLATFORM_HERMES_SPEECH_BASE_URL";
    public static final String KEY_HERMES_SPEECH_API_KEY = "PLATFORM_HERMES_SPEECH_API_KEY";
    public static final String KEY_HERMES_SPEECH_MODEL = "PLATFORM_HERMES_SPEECH_MODEL";
    public static final String KEY_HERMES_SPEECH_TIMEOUT_SECONDS = "PLATFORM_HERMES_SPEECH_TIMEOUT_SECONDS";
    public static final String KEY_HINDSIGHT_API_URL = "HINDSIGHT_API_URL";
    public static final String KEY_HINDSIGHT_API_KEY = "HINDSIGHT_API_KEY";
    public static final String KEY_HERMES_HINDSIGHT_BANK_ID = "HERMES_HINDSIGHT_BANK_ID";
    public static final String KEY_HERMES_HINDSIGHT_BUDGET = "HERMES_HINDSIGHT_BUDGET";
    public static final String KEY_HINDSIGHT_TIMEOUT_SECONDS = "PLATFORM_HINDSIGHT_TIMEOUT_SECONDS";

    public static final String SOURCE_TYPE_STATIC = "STATIC";
    public static final String SOURCE_TYPE_HTTP = "HTTP";

    public static final String EFFECTIVE_SOURCE_TYPE_SPRING = "SPRING";
    public static final String EFFECTIVE_SOURCE_TYPE_LEGACY = "LEGACY";
    public static final String EFFECTIVE_SOURCE_TYPE_NONE = "NONE";

    private final Map<String, PlatformEnvVarDefinition> definitions;

    public PlatformEnvVarRegistry() {
        this.definitions = new LinkedHashMap<>();
        // 外部代码托管与测试管理平台配置由后台托管，避免不同功能继续分散保存同一份企业级凭据。
        registerPositiveLong(new PlatformEnvVarDefinition(
                KEY_GITEE_BINDING_ENTERPRISE_ID,
                "platform.gitee.binding.enterprise-id",
                "Gitee 企业ID",
                "项目管理、迭代同步与测试推送共用的全局企业 ID。",
                false
        ));
        registerText(new PlatformEnvVarDefinition(
                KEY_GITEE_BINDING_ACCESS_TOKEN,
                "platform.gitee.binding.access-token",
                "Gitee Access Token",
                "项目管理、迭代同步与测试推送共用的全局访问令牌。",
                true
        ));
        registerUrl(new PlatformEnvVarDefinition(
                KEY_GITEE_DEFAULT_API_URL,
                "platform.gitee.default-api-url",
                "Gitee API 地址",
                "Gitee 企业版接口基础地址，用于项目绑定、迭代同步和测试计划推送。",
                false
        ));
        registerPositiveLong(new PlatformEnvVarDefinition(
                KEY_GITEE_TEST_PUSH_TEST_PLAN_ASSIGNEE_ID,
                "platform.gitee.test-push.test-plan-assignee-id",
                "Gitee 测试计划负责人ID",
                "向 Gitee 创建或更新测试计划时使用的默认负责人用户 ID。",
                false
        ));
        registerPositiveLong(new PlatformEnvVarDefinition(
                KEY_GITEE_TEST_PUSH_TEST_CASE_MODULE_ID,
                "platform.gitee.test-push.test-case-module-id",
                "Gitee 测试用例模块ID",
                "向 Gitee 推送测试用例时落入的默认模块 ID。",
                false
        ));
        registerPositiveInteger(new PlatformEnvVarDefinition(
                KEY_GITEE_TEST_PUSH_TEST_CASE_TYPE,
                "platform.gitee.test-push.test-case-type",
                "Gitee 测试用例类型",
                "向 Gitee 推送测试用例时使用的默认用例类型编码。",
                false
        ));
        registerUrl(new PlatformEnvVarDefinition(
                KEY_GITLAB_DEFAULT_API_URL,
                "platform.gitlab.default-api-url",
                "GitLab 默认 API 地址",
                "平台默认 GitLab 实例 API 地址，用于仓库绑定、用户 OAuth 与快速发起 MR。",
                false
        ));
        registerText(new PlatformEnvVarDefinition(
                KEY_GITLAB_OAUTH_CLIENT_ID,
                "platform.gitlab.oauth.client-id",
                "GitLab OAuth Client ID",
                "个人中心绑定 GitLab 账号时使用的 OAuth 应用 Client ID。",
                false
        ));
        registerText(new PlatformEnvVarDefinition(
                KEY_GITLAB_OAUTH_CLIENT_SECRET,
                "platform.gitlab.oauth.client-secret",
                "GitLab OAuth Client Secret",
                "个人中心绑定 GitLab 账号时使用的 OAuth 应用密钥。",
                true
        ));
        registerUrl(new PlatformEnvVarDefinition(
                KEY_GITLAB_OAUTH_REDIRECT_URI,
                "platform.gitlab.oauth.redirect-uri",
                "GitLab OAuth 回调地址",
                "GitLab OAuth 应用配置的回调地址，必须与平台前端可访问地址一致。",
                false
        ));

        // PR 评审统计的 OA 接口与凭据集中托管，便于按部署环境切换内网服务和密钥来源。
        registerUrl(new PlatformEnvVarDefinition(
                KEY_PR_REVIEW_OA_BASE_URL,
                "platform.pr-review.oa-base-url",
                "PR评审统计 OA 地址",
                "PR 评审统计读取开发组、PR 与待处理缺陷的 OA 接口基础地址。",
                false
        ));
        registerText(new PlatformEnvVarDefinition(
                KEY_PR_REVIEW_DEFAULT_DEV_GROUP_NAME,
                "platform.pr-review.default-dev-group-name",
                "PR评审统计默认开发组",
                "PR 评审统计页面初始化时默认选中的开发组名称。",
                false
        ));
        registerText(new PlatformEnvVarDefinition(
                KEY_PR_REVIEW_OA_USER_ID,
                "platform.pr-review.oa-user-id",
                "PR评审统计 OA 用户ID",
                "PR 评审统计访问 OA 接口时使用的全局用户 ID。",
                false
        ));
        registerText(new PlatformEnvVarDefinition(
                KEY_PR_REVIEW_OA_TOKEN,
                "platform.pr-review.oa-token",
                "PR评审统计 OA 令牌",
                "PR 评审统计访问 OA 接口时使用的全局认证令牌。",
                true
        ));

        // Yaade 代登与公共集合配置影响接口管理链路。
        // 其中默认用户密码必须与 Yaade 服务端 YAADE_DEFAULT_PASSWORD 保持一致，
        // 后台运行时覆盖不能实时改变远端 resetpassword 行为，因此不再暴露给环境变量管理。
        registerUrl(new PlatformEnvVarDefinition(
                KEY_YAADE_BASE_URL,
                "platform.yaade.base-url",
                "Yaade 代理地址",
                "平台调用 Yaade 独立服务的 API 代理基础地址。",
                false
        ));
        registerText(new PlatformEnvVarDefinition(
                KEY_YAADE_ADMIN_USERNAME,
                "platform.yaade.admin-username",
                "Yaade 管理员用户名",
                "平台自动创建用户、集合和授权时使用的 Yaade 管理员账号。",
                false
        ));
        registerText(new PlatformEnvVarDefinition(
                KEY_YAADE_ADMIN_PASSWORD,
                "platform.yaade.admin-password",
                "Yaade 管理员密码",
                "平台自动创建用户、集合和授权时使用的 Yaade 管理员密码。",
                true
        ));
        registerText(new PlatformEnvVarDefinition(
                KEY_YAADE_DEFAULT_USER_PASSWORD,
                "platform.yaade.default-user-password",
                "Yaade 默认用户密码",
                "平台为受管 Yaade 用户初始化或修复账号时使用的默认密码，必须与 Yaade 服务端 YAADE_DEFAULT_PASSWORD 保持一致。",
                true,
                false
        ));
        registerText(new PlatformEnvVarDefinition(
                KEY_YAADE_PUBLIC_COLLECTION_NAME,
                "platform.yaade.public-collection-name",
                "Yaade 公共集合名称",
                "未关联具体项目的接口文档同步到 Yaade 时使用的公共集合名称。",
                false
        ));
        registerIntegerRange(new PlatformEnvVarDefinition(
                KEY_YAADE_PROXY_SESSION_TTL_MINUTES,
                "platform.yaade.proxy-session-ttl-minutes",
                "Yaade 代理会话有效期",
                "平台生成 Yaade 代登会话后的有效分钟数。",
                false
        ), 10, 720);

        // AI 助手与记忆服务连接参数属于部署侧差异配置，放入后台后可按环境切换网关与模型。
        registerUrl(new PlatformEnvVarDefinition(
                KEY_HERMES_BASE_URL,
                "platform.hermes.base-url",
                "Hermes API 地址",
                "平台内置助手调用 Hermes Gateway 的 OpenAI 兼容接口基础地址。",
                false
        ));
        registerText(new PlatformEnvVarDefinition(
                KEY_HERMES_API_KEY,
                "platform.hermes.api-key",
                "Hermes API Key",
                "平台内置助手调用 Hermes Gateway 时携带的鉴权密钥。",
                true
        ));
        registerText(new PlatformEnvVarDefinition(
                KEY_HERMES_MODEL,
                "platform.hermes.model",
                "Hermes 模型名",
                "平台内置助手请求 Hermes Gateway 时使用的模型名称。",
                false
        ));
        registerIntegerRange(new PlatformEnvVarDefinition(
                KEY_HERMES_TIMEOUT_SECONDS,
                "platform.hermes.timeout-seconds",
                "Hermes 请求超时秒数",
                "平台内置助手等待 Hermes Gateway 响应的最长秒数。",
                false
        ), 30, 600);
        registerUrl(new PlatformEnvVarDefinition(
                KEY_HERMES_SPEECH_BASE_URL,
                "platform.hermes.speech.base-url",
                "Hermes 语音转写 API 地址",
                "语音转写功能调用 OpenAI 兼容 audio/transcriptions 接口的基础地址。",
                false
        ));
        registerText(new PlatformEnvVarDefinition(
                KEY_HERMES_SPEECH_API_KEY,
                "platform.hermes.speech.api-key",
                "Hermes 语音转写 API Key",
                "语音转写功能调用外部模型服务时携带的鉴权密钥。",
                true
        ));
        registerText(new PlatformEnvVarDefinition(
                KEY_HERMES_SPEECH_MODEL,
                "platform.hermes.speech.model",
                "Hermes 语音转写模型",
                "语音转写功能请求外部模型服务时使用的模型名称。",
                false
        ));
        registerIntegerRange(new PlatformEnvVarDefinition(
                KEY_HERMES_SPEECH_TIMEOUT_SECONDS,
                "platform.hermes.speech.timeout-seconds",
                "Hermes 语音转写超时秒数",
                "语音转写请求等待外部模型服务响应的最长秒数。",
                false
        ), 10, 300);
        registerUrl(new PlatformEnvVarDefinition(
                KEY_HINDSIGHT_API_URL,
                "platform.hindsight.base-url",
                "Hindsight API 地址",
                "平台 Wiki 语义索引、用户记忆和事实图检索访问 Hindsight 的基础地址。",
                false
        ));
        registerText(new PlatformEnvVarDefinition(
                KEY_HINDSIGHT_API_KEY,
                "platform.hindsight.api-key",
                "Hindsight API Key",
                "平台访问 Hindsight API 时携带的鉴权密钥。",
                true
        ));
        registerText(new PlatformEnvVarDefinition(
                KEY_HERMES_HINDSIGHT_BANK_ID,
                "platform.hindsight.bank-prefix",
                "Hindsight Bank 前缀",
                "平台在 Hindsight 中隔离 Wiki 与用户会话记忆时使用的 bank ID 前缀。",
                false
        ));
        registerBudget(new PlatformEnvVarDefinition(
                KEY_HERMES_HINDSIGHT_BUDGET,
                "platform.hindsight.recall-budget",
                "Hindsight 召回预算",
                "平台调用 Hindsight recall 接口时使用的预算档位。",
                false
        ));
        registerIntegerRange(new PlatformEnvVarDefinition(
                KEY_HINDSIGHT_TIMEOUT_SECONDS,
                "platform.hindsight.timeout-seconds",
                "Hindsight 请求超时秒数",
                "平台访问 Hindsight API 时等待响应的最长秒数。",
                false
        ), 5, 120);
    }

    public List<PlatformEnvVarDefinition> listDefinitions() {
        return definitions.values().stream()
                .filter(PlatformEnvVarDefinition::manageable)
                .toList();
    }

    public PlatformEnvVarDefinition requireDefinition(String envKey) {
        String normalizedKey = normalizeEnvKey(envKey);
        PlatformEnvVarDefinition definition = definitions.get(normalizedKey);
        if (definition == null) {
            throw new NoSuchElementException("环境变量不存在: " + normalizedKey);
        }
        return definition;
    }

    public PlatformEnvVarDefinition requireManageableDefinition(String envKey) {
        PlatformEnvVarDefinition definition = requireDefinition(envKey);
        if (!definition.manageable()) {
            throw new NoSuchElementException("环境变量不存在: " + definition.envKey());
        }
        return definition;
    }

    public String normalizeSourceType(String sourceType) {
        String normalized = requireText(sourceType, "来源类型不能为空").toUpperCase(Locale.ROOT);
        if (!SOURCE_TYPE_STATIC.equals(normalized) && !SOURCE_TYPE_HTTP.equals(normalized)) {
            throw new IllegalArgumentException("来源类型仅支持 STATIC 或 HTTP");
        }
        return normalized;
    }

    private void register(PlatformEnvVarDefinition definition) {
        definitions.put(definition.envKey(), definition);
    }

    private void registerText(PlatformEnvVarDefinition definition) {
        register(definition.withValidator(value -> requireText(value, definition.displayName() + "不能为空")));
    }

    private void registerUrl(PlatformEnvVarDefinition definition) {
        register(definition.withValidator(value -> requireHttpUrl(value, definition.displayName() + "必须是 http 或 https 地址")));
    }

    private void registerPositiveLong(PlatformEnvVarDefinition definition) {
        register(definition.withValidator(value -> requirePositiveLong(value, definition.displayName() + "必须为正整数")));
    }

    private void registerPositiveInteger(PlatformEnvVarDefinition definition) {
        registerIntegerRange(definition, 1, Integer.MAX_VALUE);
    }

    private void registerIntegerRange(PlatformEnvVarDefinition definition, int min, int max) {
        register(definition.withValidator(value -> requireIntegerRange(value, min, max, definition.displayName() + "必须在 " + min + " 到 " + max + " 之间")));
    }

    private void registerBudget(PlatformEnvVarDefinition definition) {
        register(definition.withValidator(value -> {
            String normalized = requireText(value, definition.displayName() + "不能为空").toLowerCase(Locale.ROOT);
            Set<String> supported = Set.of("low", "mid", "high");
            if (!supported.contains(normalized)) {
                throw new IllegalArgumentException(definition.displayName() + "仅支持 low、mid 或 high");
            }
            return normalized;
        }));
    }

    private String normalizeEnvKey(String envKey) {
        return requireText(envKey, "环境变量 Key 不能为空").toUpperCase(Locale.ROOT);
    }

    private static String requireText(String value, String message) {
        if (value == null || value.trim().isEmpty()) {
            throw new IllegalArgumentException(message);
        }
        return value.trim();
    }

    private static String requireHttpUrl(String value, String message) {
        String normalized = requireText(value, message);
        try {
            URI uri = URI.create(normalized);
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
            if (!("http".equals(scheme) || "https".equals(scheme)) || uri.getHost() == null) {
                throw new IllegalArgumentException(message);
            }
            while (normalized.endsWith("/")) {
                normalized = normalized.substring(0, normalized.length() - 1);
            }
            return normalized;
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException(message, exception);
        }
    }

    private static String requirePositiveLong(String value, String message) {
        String normalized = requireText(value, message);
        try {
            long parsed = Long.parseLong(normalized);
            if (parsed <= 0L) {
                throw new IllegalArgumentException(message);
            }
            return normalized;
        } catch (NumberFormatException exception) {
            throw new IllegalArgumentException(message, exception);
        }
    }

    private static String requireIntegerRange(String value, int min, int max, String message) {
        String normalized = requireText(value, message);
        try {
            int parsed = Integer.parseInt(normalized);
            if (parsed < min || parsed > max) {
                throw new IllegalArgumentException(message);
            }
            return normalized;
        } catch (NumberFormatException exception) {
            throw new IllegalArgumentException(message, exception);
        }
    }

    public record PlatformEnvVarDefinition(
            String envKey,
            String propertyKey,
            String displayName,
            String description,
            boolean sensitive,
            boolean manageable,
            Function<String, String> valueValidator
    ) {

        public PlatformEnvVarDefinition(String envKey,
                                        String propertyKey,
                                        String displayName,
                                        String description,
                                        boolean sensitive) {
            this(envKey, propertyKey, displayName, description, sensitive, true, Function.identity());
        }

        public PlatformEnvVarDefinition(String envKey,
                                        String propertyKey,
                                        String displayName,
                                        String description,
                                        boolean sensitive,
                                        boolean manageable) {
            this(envKey, propertyKey, displayName, description, sensitive, manageable, Function.identity());
        }

        private PlatformEnvVarDefinition withValidator(Function<String, String> validator) {
            return new PlatformEnvVarDefinition(envKey, propertyKey, displayName, description, sensitive, manageable, validator);
        }

        public String validateValue(String value) {
            return valueValidator.apply(value);
        }

        public String previewValue(String value) {
            if (value == null || value.trim().isEmpty()) {
                return "";
            }
            return sensitive ? "******" : value.trim();
        }
    }
}
