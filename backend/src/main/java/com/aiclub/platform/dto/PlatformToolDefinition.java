package com.aiclub.platform.dto;

import java.util.Map;

/**
 * 平台工具定义。
 */
public record PlatformToolDefinition(
        String code,
        String name,
        String moduleCode,
        String description,
        boolean readOnly,
        String riskLevel,
        String permissionCode,
        boolean requiresConfirm,
        Map<String, String> inputSchema
) {
}
