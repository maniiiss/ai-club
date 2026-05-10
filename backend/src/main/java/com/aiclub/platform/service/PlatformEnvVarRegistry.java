package com.aiclub.platform.service;

import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.function.Function;

/**
 * 固定环境变量注册表。
 * 用代码约束可管理 Key、运行时属性映射与取值校验规则，避免后台演化成任意键值中心。
 */
@Component
public class PlatformEnvVarRegistry {

    public static final String KEY_GITEE_BINDING_ENTERPRISE_ID = "PLATFORM_GITEE_BINDING_ENTERPRISE_ID";
    public static final String KEY_GITEE_BINDING_ACCESS_TOKEN = "PLATFORM_GITEE_BINDING_ACCESS_TOKEN";
    public static final String KEY_PR_REVIEW_OA_USER_ID = "PLATFORM_PR_REVIEW_OA_USER_ID";
    public static final String KEY_PR_REVIEW_OA_TOKEN = "PLATFORM_PR_REVIEW_OA_TOKEN";

    public static final String SOURCE_TYPE_STATIC = "STATIC";
    public static final String SOURCE_TYPE_HTTP = "HTTP";

    public static final String EFFECTIVE_SOURCE_TYPE_SPRING = "SPRING";
    public static final String EFFECTIVE_SOURCE_TYPE_LEGACY = "LEGACY";
    public static final String EFFECTIVE_SOURCE_TYPE_NONE = "NONE";

    private final Map<String, PlatformEnvVarDefinition> definitions;

    public PlatformEnvVarRegistry() {
        this.definitions = new LinkedHashMap<>();
        register(new PlatformEnvVarDefinition(
                KEY_GITEE_BINDING_ENTERPRISE_ID,
                "platform.gitee.binding.enterprise-id",
                "Gitee 企业ID",
                "项目管理、迭代同步与测试推送共用的全局企业 ID。",
                false,
                value -> {
                    String normalized = requireText(value, "Gitee 企业ID不能为空");
                    try {
                        long parsed = Long.parseLong(normalized);
                        if (parsed <= 0L) {
                            throw new IllegalArgumentException("Gitee 企业ID必须为正整数");
                        }
                    } catch (NumberFormatException exception) {
                        throw new IllegalArgumentException("Gitee 企业ID必须为正整数", exception);
                    }
                    return normalized;
                }
        ));
        register(new PlatformEnvVarDefinition(
                KEY_GITEE_BINDING_ACCESS_TOKEN,
                "platform.gitee.binding.access-token",
                "Gitee Access Token",
                "项目管理、迭代同步与测试推送共用的全局访问令牌。",
                true,
                value -> requireText(value, "Gitee Access Token不能为空")
        ));
        register(new PlatformEnvVarDefinition(
                KEY_PR_REVIEW_OA_USER_ID,
                "",
                "PR评审统计 OA 用户ID",
                "PR 评审统计访问 OA 接口时使用的全局用户 ID。",
                false,
                value -> requireText(value, "PR评审统计 OA 用户ID不能为空")
        ));
        register(new PlatformEnvVarDefinition(
                KEY_PR_REVIEW_OA_TOKEN,
                "",
                "PR评审统计 OA 令牌",
                "PR 评审统计访问 OA 接口时使用的全局认证令牌。",
                true,
                value -> requireText(value, "PR评审统计 OA 令牌不能为空")
        ));
    }

    public List<PlatformEnvVarDefinition> listDefinitions() {
        return List.copyOf(definitions.values());
    }

    public PlatformEnvVarDefinition requireDefinition(String envKey) {
        String normalizedKey = normalizeEnvKey(envKey);
        PlatformEnvVarDefinition definition = definitions.get(normalizedKey);
        if (definition == null) {
            throw new NoSuchElementException("环境变量不存在: " + normalizedKey);
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

    private String normalizeEnvKey(String envKey) {
        return requireText(envKey, "环境变量 Key 不能为空").toUpperCase(Locale.ROOT);
    }

    private static String requireText(String value, String message) {
        if (value == null || value.trim().isEmpty()) {
            throw new IllegalArgumentException(message);
        }
        return value.trim();
    }

    public record PlatformEnvVarDefinition(
            String envKey,
            String propertyKey,
            String displayName,
            String description,
            boolean sensitive,
            Function<String, String> valueValidator
    ) {

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
