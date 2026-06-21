package com.aiclub.platform.dto;

/**
 * 空间化 Wiki 搜索结果，包含页面摘要与知识检索相关度信息。
 */
public record WikiSpaceSearchResult(
        WikiSpacePageSummary page,
        Double score,
        String snippet
) {
}
