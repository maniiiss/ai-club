package com.aiclub.platform.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Wiki 知识索引配置。
 * 业务意图：把 Wiki 的向量存储、Embedding 与 rerank 配置独立于 Hermes/Hindsight 记忆链路维护，
 * 避免知识检索和会话记忆继续耦合在同一套抽象上。
 */
@Component
public class WikiKnowledgeProperties {

    private final boolean enabled;
    private final String qdrantBaseUrl;
    private final String qdrantApiKey;
    private final int qdrantTimeoutSeconds;
    private final String projectCollection;
    private final String spaceCollection;
    private final Long embeddingModelId;
    private final String embeddingBaseUrl;
    private final String embeddingApiKey;
    private final String embeddingModelName;
    private final String embeddingProvider;
    private final int vectorSearchLimit;
    private final int candidateLimit;
    private final String rerankBaseUrl;
    private final String rerankApiKey;
    private final String rerankModel;
    private final String rerankProvider;
    private final int rerankTimeoutSeconds;
    private final int rerankTopK;
    private final double graphSimilarityThreshold;
    private final int graphMaxEdgesPerNode;
    private final int graphScrollPageSize;

    public WikiKnowledgeProperties(
            @Value("${platform.wiki-knowledge.enabled:true}") boolean enabled,
            @Value("${platform.wiki-knowledge.qdrant.base-url:http://localhost:6333}") String qdrantBaseUrl,
            @Value("${platform.wiki-knowledge.qdrant.api-key:}") String qdrantApiKey,
            @Value("${platform.wiki-knowledge.qdrant.timeout-seconds:20}") int qdrantTimeoutSeconds,
            @Value("${platform.wiki-knowledge.qdrant.project-collection:wiki_project_chunks}") String projectCollection,
            @Value("${platform.wiki-knowledge.qdrant.space-collection:wiki_space_chunks}") String spaceCollection,
            @Value("${platform.wiki-knowledge.embedding.model-id:0}") long embeddingModelId,
            @Value("${platform.wiki-knowledge.embedding.base-url:}") String embeddingBaseUrl,
            @Value("${platform.wiki-knowledge.embedding.api-key:}") String embeddingApiKey,
            @Value("${platform.wiki-knowledge.embedding.model-name:}") String embeddingModelName,
            @Value("${platform.wiki-knowledge.embedding.provider:OPENAI}") String embeddingProvider,
            @Value("${platform.wiki-knowledge.search.vector-limit:12}") int vectorSearchLimit,
            @Value("${platform.wiki-knowledge.search.candidate-limit:24}") int candidateLimit,
            @Value("${platform.wiki-knowledge.rerank.base-url:}") String rerankBaseUrl,
            @Value("${platform.wiki-knowledge.rerank.api-key:}") String rerankApiKey,
            @Value("${platform.wiki-knowledge.rerank.model:}") String rerankModel,
            @Value("${platform.wiki-knowledge.rerank.provider:openai-compatible}") String rerankProvider,
            @Value("${platform.wiki-knowledge.rerank.timeout-seconds:15}") int rerankTimeoutSeconds,
            @Value("${platform.wiki-knowledge.rerank.top-k:10}") int rerankTopK,
            @Value("${platform.wiki-knowledge.graph.similarity-threshold:0.78}") double graphSimilarityThreshold,
            @Value("${platform.wiki-knowledge.graph.max-edges-per-node:6}") int graphMaxEdgesPerNode,
            @Value("${platform.wiki-knowledge.graph.scroll-page-size:256}") int graphScrollPageSize) {
        this.enabled = enabled;
        this.qdrantBaseUrl = trimTrailingSlash(qdrantBaseUrl);
        this.qdrantApiKey = defaultString(qdrantApiKey);
        this.qdrantTimeoutSeconds = Math.max(5, qdrantTimeoutSeconds);
        this.projectCollection = hasText(projectCollection) ? projectCollection.trim() : "wiki_project_chunks";
        this.spaceCollection = hasText(spaceCollection) ? spaceCollection.trim() : "wiki_space_chunks";
        this.embeddingModelId = embeddingModelId > 0 ? embeddingModelId : null;
        this.embeddingBaseUrl = trimTrailingSlash(embeddingBaseUrl);
        this.embeddingApiKey = defaultString(embeddingApiKey);
        this.embeddingModelName = defaultString(embeddingModelName);
        this.embeddingProvider = hasText(embeddingProvider) ? embeddingProvider.trim().toUpperCase() : ModelConfigService.PROVIDER_OPENAI;
        this.vectorSearchLimit = Math.max(1, Math.min(vectorSearchLimit, 100));
        this.candidateLimit = Math.max(this.vectorSearchLimit, Math.min(candidateLimit, 200));
        this.rerankBaseUrl = trimTrailingSlash(rerankBaseUrl);
        this.rerankApiKey = defaultString(rerankApiKey);
        this.rerankModel = defaultString(rerankModel);
        this.rerankProvider = hasText(rerankProvider) ? rerankProvider.trim() : "openai-compatible";
        this.rerankTimeoutSeconds = Math.max(5, rerankTimeoutSeconds);
        this.rerankTopK = Math.max(1, Math.min(rerankTopK, 50));
        this.graphSimilarityThreshold = Math.max(0d, Math.min(graphSimilarityThreshold, 1d));
        this.graphMaxEdgesPerNode = Math.max(1, Math.min(graphMaxEdgesPerNode, 50));
        this.graphScrollPageSize = Math.max(16, Math.min(graphScrollPageSize, 1024));
    }

    public boolean isEnabled() {
        return enabled;
    }

    public String getQdrantBaseUrl() {
        return qdrantBaseUrl;
    }

    public String getQdrantApiKey() {
        return qdrantApiKey;
    }

    public int getQdrantTimeoutSeconds() {
        return qdrantTimeoutSeconds;
    }

    public String getProjectCollection() {
        return projectCollection;
    }

    public String getSpaceCollection() {
        return spaceCollection;
    }

    public Long getEmbeddingModelId() {
        return embeddingModelId;
    }

    public boolean hasEmbeddingModelId() {
        return embeddingModelId != null;
    }

    public String getEmbeddingBaseUrl() {
        return embeddingBaseUrl;
    }

    public String getEmbeddingApiKey() {
        return embeddingApiKey;
    }

    public String getEmbeddingModelName() {
        return embeddingModelName;
    }

    public String getEmbeddingProvider() {
        return embeddingProvider;
    }

    public boolean hasFixedEmbeddingConfig() {
        return hasText(embeddingBaseUrl) && hasText(embeddingModelName);
    }

    public boolean hasEmbeddingConfig() {
        return hasEmbeddingModelId() || hasFixedEmbeddingConfig();
    }

    public int getVectorSearchLimit() {
        return vectorSearchLimit;
    }

    public int getCandidateLimit() {
        return candidateLimit;
    }

    public String getRerankBaseUrl() {
        return rerankBaseUrl;
    }

    public String getRerankApiKey() {
        return rerankApiKey;
    }

    public String getRerankModel() {
        return rerankModel;
    }

    public String getRerankProvider() {
        return rerankProvider;
    }

    public int getRerankTimeoutSeconds() {
        return rerankTimeoutSeconds;
    }

    public int getRerankTopK() {
        return rerankTopK;
    }

    public boolean hasRerankConfig() {
        return hasText(rerankBaseUrl) && hasText(rerankModel);
    }

    public double getGraphSimilarityThreshold() {
        return graphSimilarityThreshold;
    }

    public int getGraphMaxEdgesPerNode() {
        return graphMaxEdgesPerNode;
    }

    public int getGraphScrollPageSize() {
        return graphScrollPageSize;
    }

    private String trimTrailingSlash(String value) {
        String result = defaultString(value);
        while (result.endsWith("/")) {
            result = result.substring(0, result.length() - 1);
        }
        return result;
    }

    private String defaultString(String value) {
        return value == null ? "" : value.trim();
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }
}
