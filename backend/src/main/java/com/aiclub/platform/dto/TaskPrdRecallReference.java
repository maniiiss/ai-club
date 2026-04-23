package com.aiclub.platform.dto;

/**
 * PRD 分析时召回的参考页面摘要。
 */
public record TaskPrdRecallReference(
        Long spaceId,
        Long pageId,
        String title,
        String directoryName,
        String snippet,
        Double score
) {
}
