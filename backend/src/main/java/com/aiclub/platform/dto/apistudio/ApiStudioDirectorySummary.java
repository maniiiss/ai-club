package com.aiclub.platform.dto.apistudio;

import java.time.LocalDateTime;

/**
 * 原生 API 工作台 - 目录摘要。
 */
public record ApiStudioDirectorySummary(
        Long id,
        Long projectId,
        Long parentId,
        String name,
        String description,
        Integer sortOrder,
        Long createdBy,
        Long updatedBy,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
}
