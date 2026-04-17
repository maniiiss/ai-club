package com.aiclub.platform.dto;

/**
 * Wiki 页面列表和引用场景使用的轻量摘要。
 */
public record WikiPageSummary(
        Long id,
        Long projectId,
        Long parentPageId,
        String title,
        String slug,
        String visibilityScope,
        Integer sortOrder,
        Integer currentVersionNumber,
        String syncStatus,
        String authorName,
        boolean canView,
        boolean canEdit,
        boolean hasChildren,
        String createdAt,
        String updatedAt
) {
}
