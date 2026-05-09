package com.aiclub.platform.dto;

/**
 * 系统级环境变量详情。
 * 敏感值不直接回传明文，只返回 configured 状态与脱敏预览。
 */
public record PlatformEnvVarDetail(
        String envKey,
        String displayName,
        String description,
        boolean sensitive,
        String sourceType,
        String effectiveSourceType,
        boolean configured,
        String effectiveStatus,
        String effectiveStatusMessage,
        String updatedAt,
        String staticValue,
        boolean staticValueConfigured,
        String httpUrl,
        String httpHeadersJson,
        boolean httpHeadersConfigured,
        String resolvedValuePreview
) {
}
