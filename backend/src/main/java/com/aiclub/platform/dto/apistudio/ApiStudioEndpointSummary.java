package com.aiclub.platform.dto.apistudio;

import java.time.LocalDateTime;

/**
 * 原生 API 工作台 - API 端点摘要（列表/树用）。
 */
public record ApiStudioEndpointSummary(
        Long id,
        Long projectId,
        Long directoryId,
        String name,
        String method,
        String path,
        String summary,
        String status,
        Integer sortOrder,
        Integer revision,
        LocalDateTime updatedAt
) {
}
