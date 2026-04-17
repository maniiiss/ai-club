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
        Map<String, String> inputSchema,
        Map<String, String> outputSchema
) {

    /**
     * 兼容首版只有入参说明的构造方式，避免测试和旧调用点一次性大面积改动。
     */
    public PlatformToolDefinition(String code,
                                  String name,
                                  String moduleCode,
                                  String description,
                                  boolean readOnly,
                                  String riskLevel,
                                  String permissionCode,
                                  boolean requiresConfirm,
                                  Map<String, String> inputSchema) {
        this(code, name, moduleCode, description, readOnly, riskLevel, permissionCode, requiresConfirm, inputSchema, Map.of());
    }
}
