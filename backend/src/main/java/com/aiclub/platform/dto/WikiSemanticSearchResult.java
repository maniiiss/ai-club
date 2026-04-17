package com.aiclub.platform.dto;

/**
 * Wiki 语义搜索结果，包含页面摘要与 Hindsight 返回的相关度信息。
 */
public record WikiSemanticSearchResult(
        WikiPageSummary page,
        Double score,
        String snippet
) {
}
