package com.aiclub.platform.runtime;

/**
 * Runtime 上下文预算配置快照。
 * 业务意图：上下文窗口由 Runtime 管理端配置统一治理，并随会话/执行快照固定下来。
 */
public record RuntimeContextProfile(
        int contextWindowTokens,
        int maxOutputTokens,
        int compactionThresholdPercent,
        CompactionStrategy compactionStrategy
) {
    public static final int DEFAULT_CONTEXT_WINDOW_TOKENS = 128_000;
    public static final int DEFAULT_MAX_OUTPUT_TOKENS = 8_192;
    public static final int DEFAULT_COMPACTION_THRESHOLD_PERCENT = 80;

    public RuntimeContextProfile {
        contextWindowTokens = contextWindowTokens > 0 ? contextWindowTokens : DEFAULT_CONTEXT_WINDOW_TOKENS;
        maxOutputTokens = maxOutputTokens > 0 ? maxOutputTokens : DEFAULT_MAX_OUTPUT_TOKENS;
        compactionThresholdPercent = Math.max(50, Math.min(95,
                compactionThresholdPercent > 0 ? compactionThresholdPercent : DEFAULT_COMPACTION_THRESHOLD_PERCENT));
        compactionStrategy = compactionStrategy == null ? CompactionStrategy.NATIVE_FIRST : compactionStrategy;
    }

    public static RuntimeContextProfile defaults() {
        return new RuntimeContextProfile(
                DEFAULT_CONTEXT_WINDOW_TOKENS,
                DEFAULT_MAX_OUTPUT_TOKENS,
                DEFAULT_COMPACTION_THRESHOLD_PERCENT,
                CompactionStrategy.NATIVE_FIRST
        );
    }
}
