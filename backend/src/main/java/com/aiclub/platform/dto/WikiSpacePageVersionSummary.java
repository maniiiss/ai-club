package com.aiclub.platform.dto;

/**
 * 空间化 Wiki 页面版本摘要。
 */
public record WikiSpacePageVersionSummary(
        Long id,
        Long pageId,
        Integer versionNumber,
        String title,
        String content,
        String authorName,
        String changeSummary,
        String createdAt
) {
}
