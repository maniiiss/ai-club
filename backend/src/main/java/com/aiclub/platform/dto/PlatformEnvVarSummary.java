package com.aiclub.platform.dto;

/**
 * 系统级环境变量列表摘要。
 */
public record PlatformEnvVarSummary(
        String envKey,
        String displayName,
        String description,
        boolean sensitive,
        String sourceType,
        String effectiveSourceType,
        boolean configured,
        String effectiveStatus,
        String effectiveStatusMessage,
        String updatedAt
) {
}
