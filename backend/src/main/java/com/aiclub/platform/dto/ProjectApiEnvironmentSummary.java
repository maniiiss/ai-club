package com.aiclub.platform.dto;

import java.util.Map;

/**
 * 项目级 API 调试环境。
 */
public record ProjectApiEnvironmentSummary(
        Long id,
        Long projectId,
        String name,
        String baseUrl,
        Map<String, String> variables,
        String authType,
        ProjectApiEnvironmentAuthConfigSummary authConfig,
        Boolean isDefault,
        String createdAt,
        String updatedAt
) {
}
