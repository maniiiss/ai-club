package com.aiclub.platform.dto;

import java.util.List;

/**
 * 项目级记忆事实图主响应。
 */
public record MemoryFactGraphSummary(
        Long projectId,
        String bankId,
        String generatedAt,
        Integer nodeCount,
        Integer edgeCount,
        Integer factCount,
        List<String> warnings,
        List<MemoryFactNodeSummary> nodes,
        List<MemoryFactEdgeSummary> edges
) {
}
