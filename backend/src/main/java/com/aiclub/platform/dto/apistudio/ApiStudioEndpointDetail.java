package com.aiclub.platform.dto.apistudio;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 原生 API 工作台 - API 端点完整详情。
 */
public record ApiStudioEndpointDetail(
        Long id,
        Long projectId,
        Long directoryId,
        String name,
        String method,
        String path,
        String summary,
        String descriptionMarkdown,
        String status,
        String requestBodyType,
        String requestBodySchemaJson,
        String requestBodyExample,
        Integer sortOrder,
        Integer revision,
        Long createdBy,
        Long updatedBy,
        LocalDateTime createdAt,
        LocalDateTime updatedAt,
        List<ApiStudioEndpointParameterItem> parameters,
        List<ApiStudioResponseItem> responses
) {
}
