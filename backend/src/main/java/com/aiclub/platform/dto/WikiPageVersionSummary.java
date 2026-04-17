package com.aiclub.platform.dto;

/**
 * Wiki 页面版本历史摘要，也用于读取单个历史版本内容。
 */
public record WikiPageVersionSummary(
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
