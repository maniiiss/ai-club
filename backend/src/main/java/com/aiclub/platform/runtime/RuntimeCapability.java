package com.aiclub.platform.runtime;

/**
 * 平台统一的 Runtime 能力编码。
 *
 * 业务编排只依赖能力，不直接依赖 Codex、Claude 或其他 Runtime 名称，
 * 这样新增 Runtime 时无需修改每个业务场景的分支判断。
 */
public enum RuntimeCapability {
    CHAT,
    STREAM_EVENTS,
    SESSION_RESUME,
    PLATFORM_TOOLS,
    REPOSITORY_READ,
    REPOSITORY_WRITE,
    PLAN,
    TECHNICAL_DESIGN,
    IMPLEMENT,
    TEST;

    public static RuntimeCapability from(String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("Runtime capability is required");
        }
        try {
            return valueOf(value.trim().toUpperCase(java.util.Locale.ROOT));
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException("Unsupported Runtime capability: " + value, exception);
        }
    }
}
