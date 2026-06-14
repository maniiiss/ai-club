package com.aiclub.platform.dto;

/**
 * Wiki 语义搜索结果，包含页面摘要与知识检索相关度信息。
 */
public record WikiSemanticSearchResult(
        WikiPageSummary page,
        Double score,
        String snippet
) {
}
