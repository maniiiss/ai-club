package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.WikiPageEntity;
import com.aiclub.platform.domain.model.WikiPageV2Entity;
import com.aiclub.platform.dto.CurrentUserInfo;
import com.aiclub.platform.dto.request.HermesChatRequest;
import com.aiclub.platform.repository.WikiPageRepository;
import com.aiclub.platform.repository.WikiPageV2Repository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * Wiki 知识检索服务。
 * 业务意图：统一承接 Wiki 的向量写入、向量召回、rerank 与 Hermes Wiki 证据拼装，
 * 让 Wiki 知识库与 Hindsight 用户记忆彻底拆边界。
 */
@Service
public class WikiKnowledgeSearchService {

    private static final Logger log = LoggerFactory.getLogger(WikiKnowledgeSearchService.class);
    private static final int HERMES_EVIDENCE_LIMIT = 3;

    private final WikiKnowledgeProperties properties;
    private final QdrantClientService qdrantClientService;
    private final WikiChunkingService wikiChunkingService;
    private final ModelConfigService modelConfigService;
    private final WikiPageRepository wikiPageRepository;
    private final WikiPageV2Repository wikiPageV2Repository;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    public WikiKnowledgeSearchService(WikiKnowledgeProperties properties,
                                      QdrantClientService qdrantClientService,
                                      WikiChunkingService wikiChunkingService,
                                      ModelConfigService modelConfigService,
                                      WikiPageRepository wikiPageRepository,
                                      WikiPageV2Repository wikiPageV2Repository,
                                      ObjectMapper objectMapper) {
        this.properties = properties;
        this.qdrantClientService = qdrantClientService;
        this.wikiChunkingService = wikiChunkingService;
        this.modelConfigService = modelConfigService;
        this.wikiPageRepository = wikiPageRepository;
        this.wikiPageV2Repository = wikiPageV2Repository;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(properties.getRerankTimeoutSeconds()))
                .version(HttpClient.Version.HTTP_1_1)
                .build();
    }

    public boolean isEnabled() {
        return properties.isEnabled() && properties.hasEmbeddingModelId();
    }

    public void indexProjectPage(WikiPageEntity page) {
        if (!isEnabled() || page == null) {
            return;
        }
        deleteProjectPage(page.getProject().getId(), page.getId());
        List<WikiChunkingService.WikiChunk> chunks = wikiChunkingService.chunkMarkdown(
                "wiki-project",
                page.getId(),
                page.getCurrentVersionNumber(),
                page.getTitle(),
                buildProjectPath(page),
                buildProjectIndexContent(page)
        );
        upsertChunks(properties.getProjectCollection(), chunks, payloadForProjectPage(page));
    }

    public void deleteProjectPage(Long projectId, Long pageId) {
        if (!isEnabled() || pageId == null || projectId == null) {
            return;
        }
        qdrantClientService.deletePointsByFilter(
                properties.getProjectCollection(),
                Map.of("projectId", projectId, "pageId", pageId)
        );
    }

    public void indexSpacePage(WikiPageV2Entity page) {
        if (!isEnabled() || page == null) {
            return;
        }
        deleteSpacePage(page.getSpace().getId(), page.getId());
        List<WikiChunkingService.WikiChunk> chunks = wikiChunkingService.chunkMarkdown(
                "wiki-space",
                page.getId(),
                page.getCurrentVersionNumber(),
                page.getTitle(),
                buildSpacePath(page),
                buildSpaceIndexContent(page)
        );
        upsertChunks(properties.getSpaceCollection(), chunks, payloadForSpacePage(page));
    }

    public void deleteSpacePage(Long spaceId, Long pageId) {
        if (!isEnabled() || pageId == null || spaceId == null) {
            return;
        }
        qdrantClientService.deletePointsByFilter(
                properties.getSpaceCollection(),
                Map.of("spaceId", spaceId, "pageId", pageId)
        );
    }

    public List<WikiSearchHit> searchProjectWiki(Long projectId, String query, int limit) {
        if (!isEnabled() || projectId == null || defaultString(query).isBlank()) {
            return List.of();
        }
        List<Double> vector = modelConfigService.generateEmbedding(properties.getEmbeddingModelId(), query);
        return qdrantClientService.search(
                        properties.getProjectCollection(),
                        vector,
                        Map.of("projectId", projectId),
                        Math.max(limit, properties.getVectorSearchLimit()))
                .stream()
                .map(hit -> toSearchHit(hit, "PROJECT"))
                .toList();
    }

    /**
     * 项目 Wiki 混合检索：关键词候选与向量候选合并后统一重排。
     */
    public List<WikiRankedPageHit> hybridSearchProjectPages(Long projectId,
                                                            String query,
                                                            List<WikiPageEntity> keywordCandidates,
                                                            int limit) {
        LinkedHashMap<Long, WikiRerankCandidate> merged = new LinkedHashMap<>();
        for (WikiPageEntity page : keywordCandidates == null ? List.<WikiPageEntity>of() : keywordCandidates) {
            if (page == null || page.getId() == null) {
                continue;
            }
            merged.putIfAbsent(
                    page.getId(),
                    new WikiRerankCandidate(
                            page.getId(),
                            page.getTitle() + "\n" + abbreviate(defaultString(page.getContent()), 800),
                            "关键词匹配结果：" + abbreviate(defaultString(page.getContent()), 220),
                            1.0d
                    )
            );
        }
        for (WikiSearchHit hit : searchProjectWiki(projectId, query, properties.getVectorSearchLimit())) {
            if (hit.pageId() == null) {
                continue;
            }
            merged.putIfAbsent(
                    hit.pageId(),
                    new WikiRerankCandidate(
                            hit.pageId(),
                            hit.title() + "\n" + hit.snippet(),
                            abbreviate(defaultString(hit.snippet()), 220),
                            hit.score()
                    )
            );
        }
        return rerank(query, new ArrayList<>(merged.values()), limit).stream()
                .map(hit -> new WikiRankedPageHit(hit.pageId(), hit.snippet(), hit.score()))
                .toList();
    }

    public List<WikiSearchHit> searchSpaceWiki(Long spaceId, Long projectId, String query, int limit) {
        if (!isEnabled() || spaceId == null || defaultString(query).isBlank()) {
            return List.of();
        }
        List<Double> vector = modelConfigService.generateEmbedding(properties.getEmbeddingModelId(), query);
        LinkedHashMap<String, Object> filter = new LinkedHashMap<>();
        filter.put("spaceId", spaceId);
        if (projectId != null) {
            filter.put("projectId", projectId);
        }
        return qdrantClientService.search(
                        properties.getSpaceCollection(),
                        vector,
                        filter,
                        Math.max(limit, properties.getVectorSearchLimit()))
                .stream()
                .map(hit -> toSearchHit(hit, "SPACE"))
                .toList();
    }

    /**
     * 空间 Wiki 混合检索：关键词候选与向量候选合并后统一重排。
     */
    public List<WikiRankedPageHit> hybridSearchSpacePages(Long spaceId,
                                                          Long projectId,
                                                          String query,
                                                          List<WikiPageV2Entity> keywordCandidates,
                                                          int limit) {
        LinkedHashMap<Long, WikiRerankCandidate> merged = new LinkedHashMap<>();
        for (WikiPageV2Entity page : keywordCandidates == null ? List.<WikiPageV2Entity>of() : keywordCandidates) {
            if (page == null || page.getId() == null) {
                continue;
            }
            merged.putIfAbsent(
                    page.getId(),
                    new WikiRerankCandidate(
                            page.getId(),
                            page.getTitle() + "\n" + abbreviate(defaultString(page.getContent()), 800),
                            "关键词匹配结果：" + abbreviate(defaultString(page.getContent()), 240),
                            1.0d
                    )
            );
        }
        for (WikiSearchHit hit : searchSpaceWiki(spaceId, projectId, query, properties.getVectorSearchLimit())) {
            if (hit.pageId() == null) {
                continue;
            }
            merged.putIfAbsent(
                    hit.pageId(),
                    new WikiRerankCandidate(
                            hit.pageId(),
                            hit.title() + "\n" + hit.snippet(),
                            abbreviate(defaultString(hit.snippet()), 240),
                            hit.score()
                    )
            );
        }
        return rerank(query, new ArrayList<>(merged.values()), limit).stream()
                .map(hit -> new WikiRankedPageHit(hit.pageId(), hit.snippet(), hit.score()))
                .toList();
    }

    /**
     * 允许外层在拿到最终可见页面后，按固定顺序回填搜索结果。
     */
    public List<WikiRankedPageHit> retainRankedHitsOrder(List<WikiRankedPageHit> hits) {
        return hits == null ? List.of() : List.copyOf(hits);
    }

    public List<WikiRankedHit> rerank(String query, List<WikiRerankCandidate> candidates, int topK) {
        if (candidates == null || candidates.isEmpty()) {
            return List.of();
        }
        List<WikiRankedHit> fallback = fallbackRank(candidates, Math.max(1, topK));
        if (!properties.hasRerankConfig() || defaultString(query).isBlank()) {
            return fallback;
        }
        try {
            ObjectNode payload = objectMapper.createObjectNode();
            payload.put("model", properties.getRerankModel());
            payload.put("query", query);
            payload.put("top_n", Math.max(1, Math.min(topK, properties.getRerankTopK())));
            ArrayNode docs = payload.putArray("documents");
            for (WikiRerankCandidate candidate : candidates) {
                docs.add(candidate.document());
            }
            HttpRequest.Builder builder = HttpRequest.newBuilder()
                    .uri(URI.create(properties.getRerankBaseUrl() + "/rerank"))
                    .timeout(Duration.ofSeconds(properties.getRerankTimeoutSeconds()))
                    .header("Content-Type", "application/json");
            if (!properties.getRerankApiKey().isBlank()) {
                builder.header("Authorization", "Bearer " + properties.getRerankApiKey());
            }
            HttpResponse<String> response = httpClient.send(
                    builder.POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(payload), StandardCharsets.UTF_8)).build(),
                    HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8)
            );
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new IllegalStateException("Wiki rerank 失败，HTTP " + response.statusCode());
            }
            JsonNode root = objectMapper.readTree(response.body());
            List<WikiRankedHit> ranked = new ArrayList<>();
            for (JsonNode item : root.path("results")) {
                int index = item.path("index").asInt(-1);
                if (index < 0 || index >= candidates.size()) {
                    continue;
                }
                WikiRerankCandidate candidate = candidates.get(index);
                ranked.add(new WikiRankedHit(
                        candidate.pageId(),
                        candidate.snippet(),
                        item.path("relevance_score").isNumber() ? item.path("relevance_score").asDouble() : candidate.baseScore()
                ));
            }
            return ranked.isEmpty() ? fallback : List.copyOf(ranked);
        } catch (Exception exception) {
            log.warn("Wiki rerank 失败，降级为融合排序：{}", exception.getMessage());
            return fallback;
        }
    }

    public String buildWikiEvidenceMarkdown(CurrentUserInfo currentUser,
                                            HermesContextAssembler.HermesConversationContext context,
                                            HermesChatRequest request) {
        String query = defaultString(request == null ? null : request.question());
        if (query.isBlank()) {
            return "";
        }
        Long wikiSpaceId = context != null && context.wikiSpaceId() != null
                ? context.wikiSpaceId()
                : request == null ? null : request.wikiSpaceId();
        Long wikiPageId = context != null && context.wikiPageId() != null
                ? context.wikiPageId()
                : request == null ? null : request.wikiPageId();
        if (wikiSpaceId != null) {
            List<WikiSearchHit> hits = searchSpaceWiki(
                    wikiSpaceId,
                    request == null ? null : request.projectId(),
                    query,
                    HERMES_EVIDENCE_LIMIT
            );
            return renderEvidenceMarkdown(
                    rerank(
                            query,
                            hits.stream().map(hit -> new WikiRerankCandidate(hit.pageId(), hit.title() + "\n" + hit.snippet(), hit.snippet(), hit.score())).toList(),
                            HERMES_EVIDENCE_LIMIT
                    ),
                    wikiPageId
            );
        }
        Long projectId = context != null && context.projectId() != null
                ? context.projectId()
                : request == null ? null : request.projectId();
        if (projectId != null) {
            List<WikiSearchHit> hits = searchProjectWiki(projectId, query, HERMES_EVIDENCE_LIMIT);
            return renderEvidenceMarkdown(
                    rerank(
                            query,
                            hits.stream().map(hit -> new WikiRerankCandidate(hit.pageId(), hit.title() + "\n" + hit.snippet(), hit.snippet(), hit.score())).toList(),
                            HERMES_EVIDENCE_LIMIT
                    ),
                    wikiPageId
            );
        }
        return "";
    }

    public WikiKnowledgeRebuildResult rebuildAllIndexes() {
        if (!isEnabled()) {
            return new WikiKnowledgeRebuildResult(0, 0, false, "Wiki 知识索引未启用或未配置 Embedding 模型");
        }
        int sampleDimension = resolveSampleDimension();
        qdrantClientService.recreateCollection(properties.getProjectCollection(), sampleDimension);
        qdrantClientService.recreateCollection(properties.getSpaceCollection(), sampleDimension);
        int projectCount = 0;
        for (WikiPageEntity page : wikiPageRepository.findAll()) {
            indexProjectPage(page);
            projectCount++;
        }
        int spaceCount = 0;
        for (WikiPageV2Entity page : wikiPageV2Repository.findAll()) {
            indexSpacePage(page);
            spaceCount++;
        }
        return new WikiKnowledgeRebuildResult(projectCount, spaceCount, true, "Qdrant 全量重建完成");
    }

    /**
     * 供控制器显式触发的全量重建入口。
     */
    public WikiKnowledgeRebuildResult rebuildAllIndexesForAdmin() {
        return rebuildAllIndexes();
    }

    private void upsertChunks(String collectionName,
                              List<WikiChunkingService.WikiChunk> chunks,
                              Map<String, Object> basePayload) {
        if (chunks == null || chunks.isEmpty()) {
            return;
        }
        List<String> inputs = chunks.stream().map(WikiChunkingService.WikiChunk::content).toList();
        List<List<Double>> vectors = modelConfigService.generateEmbeddings(properties.getEmbeddingModelId(), inputs);
        if (vectors.isEmpty()) {
            return;
        }
        qdrantClientService.createCollection(collectionName, vectors.get(0).size());
        List<QdrantClientService.QdrantPoint> points = new ArrayList<>();
        for (int index = 0; index < chunks.size() && index < vectors.size(); index++) {
            WikiChunkingService.WikiChunk chunk = chunks.get(index);
            LinkedHashMap<String, Object> payload = new LinkedHashMap<>(basePayload);
            payload.put("chunkId", chunk.chunkId());
            payload.put("chunkOrder", chunk.chunkOrder());
            payload.put("sectionTitle", chunk.sectionTitle());
            payload.put("path", chunk.path());
            payload.put("content", chunk.content());
            payload.put("plainText", chunk.plainText());
            payload.put("tokenCount", chunk.tokenCount());
            points.add(new QdrantClientService.QdrantPoint(chunk.chunkId(), vectors.get(index), Map.copyOf(payload)));
        }
        qdrantClientService.upsertPoints(collectionName, points);
    }

    private int resolveSampleDimension() {
        return modelConfigService.generateEmbedding(properties.getEmbeddingModelId(), "wiki knowledge bootstrap").size();
    }

    private WikiSearchHit toSearchHit(QdrantClientService.QdrantSearchHit hit, String sourceType) {
        Map<String, Object> payload = hit.payload() == null ? Map.of() : hit.payload();
        return new WikiSearchHit(
                longValue(payload.get("pageId")),
                stringValue(payload.get("title")),
                stringValue(payload.get("plainText")),
                hit.score(),
                sourceType
        );
    }

    private List<WikiRankedHit> fallbackRank(List<WikiRerankCandidate> candidates, int topK) {
        return candidates.stream()
                .sorted(Comparator.comparing((WikiRerankCandidate item) -> item.baseScore() == null ? Double.NEGATIVE_INFINITY : item.baseScore()).reversed())
                .limit(topK)
                .map(item -> new WikiRankedHit(item.pageId(), item.snippet(), item.baseScore()))
                .toList();
    }

    private String renderEvidenceMarkdown(List<WikiRankedHit> hits, Long currentPageId) {
        StringBuilder builder = new StringBuilder();
        for (WikiRankedHit hit : hits) {
            if (Objects.equals(hit.pageId(), currentPageId)) {
                continue;
            }
            builder.append("- ")
                    .append(defaultString(hit.snippet()))
                    .append("（来源：Wiki 知识库）\n");
        }
        return builder.toString().trim();
    }

    private Map<String, Object> payloadForProjectPage(WikiPageEntity page) {
        LinkedHashMap<String, Object> payload = new LinkedHashMap<>();
        payload.put("pageId", page.getId());
        payload.put("projectId", page.getProject().getId());
        payload.put("title", page.getTitle());
        payload.put("slug", page.getSlug());
        payload.put("visibilityScope", page.getVisibilityScope());
        payload.put("updatedAt", page.getUpdatedAt() == null ? "" : page.getUpdatedAt().toString());
        return Map.copyOf(payload);
    }

    private Map<String, Object> payloadForSpacePage(WikiPageV2Entity page) {
        LinkedHashMap<String, Object> payload = new LinkedHashMap<>();
        payload.put("pageId", page.getId());
        payload.put("spaceId", page.getSpace().getId());
        Long projectId = resolveSpaceProjectId(page);
        if (projectId != null) {
            payload.put("projectId", projectId);
        }
        payload.put("title", page.getTitle());
        payload.put("slug", page.getSlug());
        payload.put("directoryId", page.getDirectory().getId());
        payload.put("updatedAt", page.getUpdatedAt() == null ? "" : page.getUpdatedAt().toString());
        return Map.copyOf(payload);
    }

    private Long resolveSpaceProjectId(WikiPageV2Entity page) {
        if (page == null || page.getDirectory() == null) {
            return null;
        }
        if (page.getDirectory().getBoundProject() != null) {
            return page.getDirectory().getBoundProject().getId();
        }
        return page.getSpace() != null && page.getSpace().getBoundProject() != null
                ? page.getSpace().getBoundProject().getId()
                : null;
    }

    private String buildProjectPath(WikiPageEntity page) {
        List<String> nodes = new ArrayList<>();
        WikiPageEntity cursor = page;
        while (cursor != null) {
            nodes.add(0, cursor.getTitle());
            cursor = cursor.getParentPage();
        }
        return String.join(" / ", nodes);
    }

    private String buildProjectIndexContent(WikiPageEntity page) {
        return "项目：" + page.getProject().getName() + "\n"
                + "路径：" + buildProjectPath(page) + "\n"
                + "标题：" + page.getTitle() + "\n"
                + "Slug：" + page.getSlug() + "\n"
                + "可见范围：" + defaultString(page.getVisibilityScope()) + "\n\n"
                + defaultString(page.getContent());
    }

    private String buildSpacePath(WikiPageV2Entity page) {
        List<String> nodes = new ArrayList<>();
        if (page.getDirectory() != null) {
            nodes.add(page.getDirectory().getName());
        }
        WikiPageV2Entity cursor = page.getParentPage();
        while (cursor != null) {
            nodes.add(0, cursor.getTitle());
            cursor = cursor.getParentPage();
        }
        nodes.add(page.getTitle());
        return String.join(" / ", nodes);
    }

    private String buildSpaceIndexContent(WikiPageV2Entity page) {
        return "空间：" + page.getSpace().getName() + "\n"
                + "路径：" + buildSpacePath(page) + "\n"
                + "标题：" + page.getTitle() + "\n"
                + "Slug：" + page.getSlug() + "\n"
                + "关联项目：" + stringValue(page.getSpace().getBoundProject() == null ? "" : page.getSpace().getBoundProject().getName()) + "\n\n"
                + defaultString(page.getContent());
    }

    private Long longValue(Object value) {
        if (value instanceof Number number) {
            return number.longValue();
        }
        if (value == null) {
            return null;
        }
        try {
            return Long.parseLong(String.valueOf(value));
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private String stringValue(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    private String defaultString(String value) {
        return value == null ? "" : value.trim();
    }

    private String abbreviate(String value, int maxLength) {
        String normalized = defaultString(value);
        if (normalized.length() <= maxLength) {
            return normalized;
        }
        return normalized.substring(0, Math.max(0, maxLength - 3)) + "...";
    }

    public record WikiSearchHit(Long pageId, String title, String snippet, Double score, String sourceType) {
    }

    public record WikiRerankCandidate(Long pageId, String document, String snippet, Double baseScore) {
    }

    public record WikiRankedHit(Long pageId, String snippet, Double score) {
    }

    public record WikiRankedPageHit(Long pageId, String snippet, Double score) {
    }

    public record WikiKnowledgeRebuildResult(int projectPageCount,
                                             int spacePageCount,
                                             boolean success,
                                             String message) {
    }
}
