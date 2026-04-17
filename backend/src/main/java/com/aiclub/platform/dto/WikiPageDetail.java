package com.aiclub.platform.dto;

import java.util.List;

/**
 * Wiki 页面详情响应，包含正文、访问控制和版本状态。
 */
public record WikiPageDetail(
        Long id,
        Long projectId,
        Long parentPageId,
        String title,
        String slug,
        String content,
        String visibilityScope,
        Integer sortOrder,
        Integer currentVersionNumber,
        String syncStatus,
        String lastSyncedAt,
        String lastSyncError,
        String authorName,
        boolean canView,
        boolean canEdit,
        List<Long> specificViewerUserIds,
        List<Long> specificEditorUserIds,
        List<WikiPageSummary> relatedPages,
        String createdAt,
        String updatedAt
) {
    public WikiPageDetail {
        specificViewerUserIds = specificViewerUserIds == null ? List.of() : List.copyOf(specificViewerUserIds);
        specificEditorUserIds = specificEditorUserIds == null ? List.of() : List.copyOf(specificEditorUserIds);
        relatedPages = relatedPages == null ? List.of() : List.copyOf(relatedPages);
    }
}
