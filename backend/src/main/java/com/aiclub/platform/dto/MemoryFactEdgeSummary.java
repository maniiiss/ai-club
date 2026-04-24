package com.aiclub.platform.dto;

import java.util.List;

/**
 * 记忆事实图关系摘要。
 */
public record MemoryFactEdgeSummary(
        String id,
        String sourceId,
        String targetId,
        String relationType,
        Double weight,
        List<String> factIds,
        String metadataJson
) {
}
