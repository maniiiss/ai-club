package com.aiclub.platform.dto;

import java.util.List;

/**
 * 空间化 Wiki 向量化知识图谱。
 * 业务意图：把存在 Qdrant 中的 chunk 级向量在页面层聚合后，
 * 同时输出目录层级关系（结构边）与向量语义相似关系（语义边），
 * 供前端用图谱直观呈现「向量化数据之间的关联」。
 */
public record WikiSpaceKnowledgeGraph(
        Long spaceId,
        String spaceName,
        /** 向量索引是否启用：未启用时仅返回目录层级骨架，不报错。 */
        boolean vectorEnabled,
        String generatedAt,
        List<Node> nodes,
        List<Edge> edges
) {
    public WikiSpaceKnowledgeGraph {
        nodes = nodes == null ? List.of() : List.copyOf(nodes);
        edges = edges == null ? List.of() : List.copyOf(edges);
    }

    /**
     * 图谱节点。nodeType 取值：WIKI_DIRECTORY（目录）、WIKI_PAGE（页面）。
     * id 为前端画布使用的数值节点 id，目录与页面通过偏移区分，避免冲突；
     * bizId 为对应的业务主键（目录或页面的真实 id）。
     */
    public record Node(
            Long id,
            String nodeType,
            Long bizId,
            String name,
            String slug,
            Long directoryId,
            Integer chunkCount,
            String metadataJson
    ) {
    }

    /**
     * 图谱边。edgeType 取值：
     * BELONGS_TO_DIRECTORY（页面归属目录的结构边）、
     * SEMANTIC_SIMILAR（页面间向量语义相似边，similarity 为余弦相似度）。
     */
    public record Edge(
            Long id,
            Long fromNodeId,
            Long toNodeId,
            String edgeType,
            Double similarity,
            String evidenceText
    ) {
    }
}
