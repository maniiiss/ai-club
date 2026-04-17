package com.aiclub.platform.dto;

/**
 * 空间化 Wiki 搜索结果。
 */
public record WikiSpaceSearchResult(
        WikiSpacePageSummary page,
        Double score,
        String snippet
) {
}
