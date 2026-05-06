package com.aiclub.platform.dto;

/**
 * API 目录节点摘要。
 */
public record ProjectApiFolderSummary(
        Long id,
        Long projectId,
        Long parentFolderId,
        String name,
        Integer sortOrder,
        String createdAt,
        String updatedAt
) {
}
