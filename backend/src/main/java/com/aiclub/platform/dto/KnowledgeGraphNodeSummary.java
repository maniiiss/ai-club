package com.aiclub.platform.dto;

public record KnowledgeGraphNodeSummary(
        Long id,
        String nodeType,
        Long bizId,
        String name,
        String description,
        String metadataJson
) {
}
