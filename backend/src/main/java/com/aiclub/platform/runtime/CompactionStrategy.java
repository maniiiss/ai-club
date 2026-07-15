package com.aiclub.platform.runtime;

/**
 * Runtime 上下文达到预算后的压缩策略。
 * 业务意图：由平台管理员控制是否优先使用 Runtime 原生压缩，以及是否允许 backend 兜底。
 */
public enum CompactionStrategy {
    NATIVE_FIRST,
    BACKEND_FALLBACK,
    DISABLED
}
