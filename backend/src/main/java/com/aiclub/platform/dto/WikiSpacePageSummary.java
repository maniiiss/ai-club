package com.aiclub.platform.dto;

import java.util.List;

/**
 * 空间化 Wiki 页面列表与搜索摘要。
 */
public record WikiSpacePageSummary(
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
        Integer currentVersionNumber,
        String syncStatus,
        String authorName,
        boolean canEdit,
        String updatedAt,
        List<WikiSpacePageSummary> children
) {
    public WikiSpacePageSummary {
        children = children == null ? List.of() : List.copyOf(children);
    }
}
