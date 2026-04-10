package com.aiclub.platform.dto;

public record KnowledgeGraphEdgeSummary(
        Long id,
        Long fromNodeId,
        Long toNodeId,
        String edgeType,
        String sourceType,
        Double confidence,
        String status,
        String evidenceText
) {
}
