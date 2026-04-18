package com.aiclub.platform.dto;

import java.util.List;

/**
 * 空间化 Wiki 页面详情。
 */
public record WikiSpacePageDetail(
        Long id,
        Long spaceId,
        String spaceName,
        Long directoryId,
        String directoryName,
        Long parentPageId,
        Long boundProjectId,
        String boundProjectName,
        String title,
        String slug,
        String content,
        Integer currentVersionNumber,
        String syncStatus,
        String lastSyncedAt,
        String lastSyncError,
        String authorName,
        boolean canEdit,
        WikiImportSourceSummary importSource,
        List<WikiSpacePageSummary> relatedPages,
        String createdAt,
        String updatedAt
) {
    public WikiSpacePageDetail {
        relatedPages = relatedPages == null ? List.of() : List.copyOf(relatedPages);
    }
}
