package com.aiclub.platform.dto.apistudio;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 原生 API 工作台 - 环境详情。
 * 含变量列表；变量值若 secret=true 在 DTO 中返回掩码。
 */
public record ApiStudioEnvironmentDetail(
        Long id,
        Long projectId,
        String name,
        String baseUrl,
        String commonHeadersJson,
        String authType,
        String authConfigJson,
        Boolean isDefault,
        LocalDateTime createdAt,
        LocalDateTime updatedAt,
        List<ApiStudioEnvironmentVariableItem> variables
) {
}
