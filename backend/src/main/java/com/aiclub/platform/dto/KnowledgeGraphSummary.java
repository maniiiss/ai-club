package com.aiclub.platform.dto;

import java.util.List;

public record KnowledgeGraphSummary(
        Long projectId,
        Integer nodeCount,
        Integer edgeCount,
        String generatedAt,
        List<KnowledgeGraphNodeSummary> nodes,
        List<KnowledgeGraphEdgeSummary> edges
) {
}
