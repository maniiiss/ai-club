package com.aiclub.platform.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

/**
 * Hindsight HTTP 客户端。
 * 这里统一承接 Wiki retain/recall 和记忆事实图相关的实体图、实体详情、事实召回，
 * 避免外层业务代码直接依赖 Hindsight 的具体接口路径与字段名。
 */
@Service
public class HindsightClientService {

    private final HindsightProperties properties;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    public HindsightClientService(HindsightProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(properties.getTimeoutSeconds()))
                .version(HttpClient.Version.HTTP_1_1)
                .build();
    }

    /**
     * 将 Wiki 页面文本写入项目级 Hindsight bank。
     */
    public void retainWikiDocument(Long projectId,
                                   String documentId,
                                   String title,
                                   String content,
                                   List<String> tags,
                                   Map<String, Object> metadata) {
        sendJsonRequest("POST", memoriesUrl(projectId), buildRetainPayload(documentId, title, content, tags, metadata));
    }

    /**
     * 从项目级 Hindsight bank 召回语义相近的 Wiki 文档。
     */
    public List<WikiRecallHit> recallWikiDocuments(Long projectId, String query, int limit) {
        try {
            HttpResponse<String> response = sendJsonRequest(
                    "POST",
                    recallUrl(projectId),
                    buildRecallPayload(query, limit, List.of("wiki", "project:" + projectId))
            );
            JsonNode root = objectMapper.readTree(response.body());
            return extractRecallHits(root);
        } catch (IOException exception) {
            throw new IllegalStateException("解析 Hindsight 召回结果失败", exception);
        }
    }

    /**
     * 从 Hindsight 中删除指定 Wiki 文档。
     */
    public void deleteWikiDocument(Long projectId, String documentId) {
        sendJsonRequest("DELETE", documentsUrl(projectId, documentId), null);
    }

    /**
     * 将 Wiki 页面文本写入空间级 Hindsight bank。
     */
    public void retainWikiSpaceDocument(Long spaceId,
                                        String documentId,
                                        String title,
                                        String content,
                                        List<String> tags,
                                        Map<String, Object> metadata) {
        sendJsonRequest("POST", spaceMemoriesUrl(spaceId), buildRetainPayload(documentId, title, content, tags, metadata));
    }

    /**
     * 从空间级 Hindsight bank 召回语义相近的 Wiki 文档。
     */
    public List<WikiRecallHit> recallWikiSpaceDocuments(Long spaceId, String query, int limit) {
        try {
            HttpResponse<String> response = sendJsonRequest(
                    "POST",
                    spaceRecallUrl(spaceId),
                    buildRecallPayload(query, limit, List.of("wiki", "space:" + spaceId))
            );
            JsonNode root = objectMapper.readTree(response.body());
            return extractRecallHits(root);
        } catch (IOException exception) {
            throw new IllegalStateException("解析空间 Wiki Hindsight 召回结果失败", exception);
        }
    }

    /**
     * 从空间级 Hindsight 中删除指定 Wiki 文档。
     */
    public void deleteWikiSpaceDocument(Long spaceId, String documentId) {
        sendJsonRequest("DELETE", spaceDocumentsUrl(spaceId, documentId), null);
    }

    /**
     * 读取记忆事实图所需的实体图骨架。
     * 当前优先对接 Hindsight 的实体图接口，字段解析尽量对不同版本保持兼容。
     */
    public MemoryEntityGraph fetchEntityGraph(String bankId, int limit) {
        return fetchEntityGraph(bankId, limit, null, List.of());
    }

    /**
     * 图接口除了骨架节点和关系外，Hindsight 还会返回 table_rows。
     * 记忆事实图的 Table 模式需要直接消费这批行数据，避免空查询 recall 在部分版本上返回 422。
     */
    public MemoryEntityGraph fetchEntityGraph(String bankId, int limit, String query, List<String> tags) {
        LinkedHashMap<String, Object> params = new LinkedHashMap<>();
        params.put("limit", String.valueOf(Math.max(1, Math.min(limit, 500))));
        if (hasText(query)) {
            params.put("q", defaultString(query));
        }
        List<String> normalizedTags = normalizeTags(tags);
        if (!normalizedTags.isEmpty()) {
            params.put("tags", normalizedTags);
        }
        String url = appendQuery(properties.memoryFactEntityGraphUrl(bankId), params);
        try {
            HttpResponse<String> response = sendJsonRequest("GET", url, null);
            return parseEntityGraph(objectMapper.readTree(response.body()));
        } catch (IOException exception) {
            throw new IllegalStateException("解析 Hindsight 实体图结果失败", exception);
        }
    }

    /**
     * 读取单实体详情与观察记录。
     */
    public MemoryEntityDetail getEntityDetail(String bankId, String entityId) {
        try {
            HttpResponse<String> response = sendJsonRequest("GET", properties.memoryFactEntityDetailUrl(bankId, entityId), null);
            return parseEntityDetail(objectMapper.readTree(response.body()));
        } catch (IOException exception) {
            throw new IllegalStateException("解析 Hindsight 实体详情失败", exception);
        }
    }

    /**
     * 通过 recall 拉取与查询词相关的事实证据。
     * 第一版事实面板统一走 recall，以便复用 tags 过滤与来源片段。
     */
    public List<MemoryWorldFact> recallWorldFacts(String bankId, String query, List<String> tags, int limit) {
        try {
            HttpResponse<String> response = sendJsonRequest(
                    "POST",
                    properties.memoryFactRecallUrl(bankId),
                    buildWorldFactRecallPayload(query, limit, tags)
            );
            JsonNode root = objectMapper.readTree(response.body());
            return extractWorldFacts(root, bankId);
        } catch (IOException exception) {
            throw new IllegalStateException("解析 Hindsight 事实召回结果失败", exception);
        }
    }

    private String memoriesUrl(Long projectId) {
        return properties.getBaseUrl() + "/v1/default/banks/" + encode(properties.wikiBankId(projectId)) + "/memories";
    }

    private String documentsUrl(Long projectId, String documentId) {
        return properties.getBaseUrl() + "/v1/default/banks/" + encode(properties.wikiBankId(projectId)) + "/documents/" + encode(documentId);
    }

    private String recallUrl(Long projectId) {
        return memoriesUrl(projectId) + "/recall";
    }

    private String spaceMemoriesUrl(Long spaceId) {
        return properties.getBaseUrl() + "/v1/default/banks/" + encode(properties.wikiSpaceBankId(spaceId)) + "/memories";
    }

    private String spaceDocumentsUrl(Long spaceId, String documentId) {
        return properties.getBaseUrl() + "/v1/default/banks/" + encode(properties.wikiSpaceBankId(spaceId)) + "/documents/" + encode(documentId);
    }

    private String spaceRecallUrl(Long spaceId) {
        return spaceMemoriesUrl(spaceId) + "/recall";
    }

    private HttpResponse<String> sendJsonRequest(String method, String url, JsonNode payload) {
        try {
            HttpRequest.Builder builder = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(Duration.ofSeconds(properties.getTimeoutSeconds()))
                    .header("Content-Type", "application/json");
            if (!properties.getApiKey().isBlank()) {
                builder.header("Authorization", "Bearer " + properties.getApiKey());
            }
            String body = payload == null ? "" : objectMapper.writeValueAsString(payload);
            HttpRequest request = switch (method) {
                case "DELETE" -> builder.DELETE().build();
                case "GET" -> builder.GET().build();
                case "POST" -> builder.POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8)).build();
                default -> throw new IllegalArgumentException("不支持的 Hindsight 请求方法: " + method);
            };
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new IllegalStateException("Hindsight 调用失败：" + limitMessage(response.body()));
            }
            return response;
        } catch (IOException | InterruptedException exception) {
            if (exception instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            throw new IllegalStateException("Hindsight 请求失败：" + limitMessage(exception.getMessage()), exception);
        }
    }

    /**
     * 按 Hindsight 0.5.0 的 RetainRequest 结构组装请求体。
     */
    private ObjectNode buildRetainPayload(String documentId,
                                          String title,
                                          String content,
                                          List<String> tags,
                                          Map<String, Object> metadata) {
        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("async", false);
        ArrayNode items = payload.putArray("items");
        ObjectNode item = items.addObject();
        item.put("content", content == null ? "" : content);
        item.put("context", "wiki");
        item.put("document_id", documentId == null ? "" : documentId);
        ArrayNode tagArray = item.putArray("tags");
        for (String tag : normalizeTags(tags)) {
            tagArray.add(tag);
        }
        ObjectNode metadataNode = item.putObject("metadata");
        metadataNode.put("title", title == null ? "" : title);
        metadataNode.put("source", "wiki");
        for (Map.Entry<String, Object> entry : (metadata == null ? Map.<String, Object>of() : metadata).entrySet()) {
            if (entry.getKey() == null || entry.getKey().isBlank() || entry.getValue() == null) {
                continue;
            }
            metadataNode.put(entry.getKey(), String.valueOf(entry.getValue()));
        }
        return payload;
    }

    /**
     * recall 请求统一走一套结构，便于项目 Wiki 和事实图共用。
     */
    private ObjectNode buildRecallPayload(String query, int limit, List<String> tags) {
        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("query", defaultString(query));
        payload.put("limit", Math.max(1, Math.min(limit, 20)));
        payload.put("budget", properties.getRecallBudget());
        ArrayNode tagArray = payload.putArray("tags");
        for (String tag : normalizeTags(tags)) {
            tagArray.add(tag);
        }
        return payload;
    }

    /**
     * 事实召回显式限制 world 类型，避免面板混入 chunk 结果。
     */
    private ObjectNode buildWorldFactRecallPayload(String query, int limit, List<String> tags) {
        ObjectNode payload = buildRecallPayload(query, Math.max(1, Math.min(limit, 200)), tags);
        ArrayNode types = payload.putArray("types");
        types.add("world");
        return payload;
    }

    /**
     * 递归解析 recall 响应，兼容不同版本字段包裹层级。
     */
    private void collectRecallHits(JsonNode node, List<WikiRecallHit> hits) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return;
        }
        if (node.isObject()) {
            WikiRecallHit hit = toRecallHit(node);
            if (hit.documentId() != null && !hit.documentId().isBlank()) {
                hits.add(hit);
            }
            node.fields().forEachRemaining(entry -> collectRecallHits(entry.getValue(), hits));
            return;
        }
        if (node.isArray()) {
            for (JsonNode item : node) {
                collectRecallHits(item, hits);
            }
        }
    }

    /**
     * 优先读取 Hindsight recall 的主结果数组，保留其原始 rerank 顺序；
     * 若不存在标准数组结构，则退回原有递归解析兜底。
     */
    private List<WikiRecallHit> extractRecallHits(JsonNode root) {
        JsonNode resultsNode = firstArray(root, "results", "hits", "items", "memories");
        if (resultsNode != null) {
            List<WikiRecallHit> orderedHits = new ArrayList<>();
            for (JsonNode item : resultsNode) {
                List<WikiRecallHit> candidates = new ArrayList<>();
                collectRecallHits(item, candidates);
                WikiRecallHit best = pickBestHit(candidates);
                if (best.documentId() != null && !best.documentId().isBlank()) {
                    orderedHits.add(best);
                }
            }
            return deduplicateHits(orderedHits);
        }

        List<WikiRecallHit> hits = new ArrayList<>();
        collectRecallHits(root, hits);
        return deduplicateHits(hits);
    }

    private WikiRecallHit toRecallHit(JsonNode node) {
        String documentId = firstText(node, "document_id", "documentId", "id");
        JsonNode metadata = node.path("metadata");
        if (!hasText(documentId) && metadata.isObject()) {
            documentId = firstText(metadata, "document_id", "documentId");
        }
        Long pageId = firstLong(metadata, "pageId", "page_id");
        String title = firstText(node, "title", "name");
        if (!hasText(title)) {
            title = firstText(metadata, "title");
        }
        String snippet = firstText(node, "snippet", "text", "content", "memory");
        Double score = firstDouble(node, "score", "similarity", "distance", "rank_score", "relevance", "relevanceScore");
        if (score == null && metadata.isObject()) {
            score = firstDouble(metadata, "score", "similarity", "distance", "rank_score", "relevance", "relevanceScore");
        }
        return new WikiRecallHit(documentId, pageId, title, snippet, score);
    }

    private MemoryEntityGraph parseEntityGraph(JsonNode root) {
        JsonNode graphNode = root.path("data").isObject() ? root.path("data") : root;
        List<MemoryEntityNode> nodes = new ArrayList<>();
        JsonNode nodeArray = firstArray(graphNode, "nodes");
        if (nodeArray != null) {
            for (JsonNode node : nodeArray) {
                JsonNode data = node.path("data").isObject() ? node.path("data") : node;
                String entityId = firstText(data, "id", "entity_id", "entityId");
                if (!hasText(entityId)) {
                    entityId = firstText(node, "id");
                }
                if (!hasText(entityId)) {
                    continue;
                }
                String label = firstText(data, "label", "name", "canonicalName", "canonical_name", "id");
                Integer mentionCount = firstInt(data, "mentionCount", "mention_count", "frequency", "count");
                String color = firstText(data, "color", "type");
                Map<String, Object> metadata = objectMap(data);
                if (!metadata.containsKey("type") && hasText(firstText(data, "text", "fact_type", "context"))) {
                    metadata.put("type", "FACT");
                }
                nodes.add(new MemoryEntityNode(
                        entityId,
                        hasText(label) ? label : entityId,
                        mentionCount == null ? 0 : mentionCount,
                        color,
                        metadata
                ));
            }
        }

        List<MemoryEntityEdge> edges = new ArrayList<>();
        JsonNode edgeArray = firstArray(graphNode, "edges");
        if (edgeArray != null) {
            for (JsonNode edge : edgeArray) {
                JsonNode data = edge.path("data").isObject() ? edge.path("data") : edge;
                String edgeId = firstText(data, "id");
                if (!hasText(edgeId)) {
                    edgeId = firstText(edge, "id");
                }
                String sourceId = firstText(data, "source", "from", "source_id", "sourceId");
                if (!hasText(sourceId)) {
                    sourceId = firstText(edge, "source", "from");
                }
                String targetId = firstText(data, "target", "to", "target_id", "targetId");
                if (!hasText(targetId)) {
                    targetId = firstText(edge, "target", "to");
                }
                if (!hasText(sourceId) || !hasText(targetId)) {
                    continue;
                }
                edges.add(new MemoryEntityEdge(
                        hasText(edgeId) ? edgeId : sourceId + "-" + targetId,
                        sourceId,
                        targetId,
                        firstText(data, "linkType", "link_type", "relationType", "relation_type", "type"),
                        firstDouble(data, "weight", "score", "strength"),
                        firstText(data, "lastCooccurred", "last_cooccurred", "lastSeen", "last_seen"),
                        objectMap(data)
                ));
            }
        }

        List<MemoryTableRow> tableRows = new ArrayList<>();
        JsonNode tableRowArray = firstArray(graphNode, "table_rows", "tableRows");
        if (tableRowArray != null) {
            for (JsonNode row : tableRowArray) {
                tableRows.add(new MemoryTableRow(
                        firstText(row, "id"),
                        firstText(row, "text", "summary", "content", "memory"),
                        firstText(row, "context"),
                        firstText(row, "occurred_start", "occurredStart"),
                        firstText(row, "occurred_end", "occurredEnd"),
                        firstText(row, "mentioned_at", "mentionedAt"),
                        firstText(row, "date"),
                        parseLooseStringList(row.path("entities")),
                        firstText(row, "document_id", "documentId"),
                        firstText(row, "chunk_id", "chunkId"),
                        firstText(row, "fact_type", "factType", "type"),
                        firstStringList(row.path("tags")),
                        firstText(row, "created_at", "createdAt"),
                        firstInt(row, "proof_count", "proofCount"),
                        objectMap(row)
                ));
            }
        }

        return new MemoryEntityGraph(
                nodes,
                edges,
                tableRows,
                firstInt(graphNode, "total_units", "totalUnits")
        );
    }

    private MemoryEntityDetail parseEntityDetail(JsonNode root) {
        JsonNode data = root.path("data").isObject() ? root.path("data") : root;
        Map<String, Object> metadata = objectMap(data);
        String entityId = firstText(data, "id", "entity_id", "entityId");
        String canonicalName = firstText(data, "canonicalName", "canonical_name", "label", "name", "id");
        Integer mentionCount = firstInt(data, "mentionCount", "mention_count", "frequency", "count");
        List<String> aliases = firstStringList(data.path("aliases"));
        if (aliases.isEmpty()) {
            aliases = firstStringList(data.path("nameVariants"));
        }
        if (aliases.isEmpty()) {
            aliases = firstStringList(data.path("name_variants"));
        }
        List<MemoryObservation> observations = new ArrayList<>();
        JsonNode observationArray = firstArray(data, "observations");
        if (observationArray != null) {
            for (JsonNode observation : observationArray) {
                String text = firstText(observation, "observation", "summary", "text", "content");
                if (!hasText(text)) {
                    continue;
                }
                observations.add(new MemoryObservation(
                        text,
                        firstText(observation, "notedAt", "noted_at", "date", "createdAt", "created_at"),
                        objectMap(observation)
                ));
            }
        }
        return new MemoryEntityDetail(
                entityId,
                hasText(canonicalName) ? canonicalName : entityId,
                mentionCount == null ? 0 : mentionCount,
                aliases,
                firstText(data, "firstSeen", "first_seen"),
                firstText(data, "lastSeen", "last_seen"),
                metadata,
                observations
        );
    }

    private List<MemoryWorldFact> extractWorldFacts(JsonNode root, String bankId) {
        Map<String, JsonNode> sourceFacts = objectFieldMap(root.path("source_facts"));
        Map<String, JsonNode> chunks = objectFieldMap(root.path("chunks"));
        List<MemoryWorldFact> facts = new ArrayList<>();
        JsonNode resultsNode = firstArray(root, "results", "hits", "items", "memories");
        if (resultsNode != null) {
            for (JsonNode item : resultsNode) {
                MemoryWorldFact fact = toWorldFact(item, bankId, sourceFacts, chunks);
                if (fact != null) {
                    facts.add(fact);
                }
            }
            return deduplicateWorldFacts(facts);
        }
        collectWorldFacts(root, bankId, sourceFacts, chunks, facts);
        return deduplicateWorldFacts(facts);
    }

    private void collectWorldFacts(JsonNode node,
                                   String bankId,
                                   Map<String, JsonNode> sourceFacts,
                                   Map<String, JsonNode> chunks,
                                   List<MemoryWorldFact> facts) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return;
        }
        if (node.isObject()) {
            MemoryWorldFact fact = toWorldFact(node, bankId, sourceFacts, chunks);
            if (fact != null) {
                facts.add(fact);
            }
            node.fields().forEachRemaining(entry -> collectWorldFacts(entry.getValue(), bankId, sourceFacts, chunks, facts));
            return;
        }
        if (node.isArray()) {
            for (JsonNode item : node) {
                collectWorldFacts(item, bankId, sourceFacts, chunks, facts);
            }
        }
    }

    private MemoryWorldFact toWorldFact(JsonNode node,
                                        String bankId,
                                        Map<String, JsonNode> sourceFacts,
                                        Map<String, JsonNode> chunks) {
        String factId = firstText(node, "id", "memory_id", "memoryId", "document_id", "documentId");
        String text = firstText(node, "text", "content", "snippet", "memory");
        if (!hasText(factId) && !hasText(text)) {
            return null;
        }
        List<String> sourceFactIds = firstStringList(node.path("source_fact_ids"));
        if (sourceFactIds.isEmpty()) {
            sourceFactIds = firstStringList(node.path("sourceFactIds"));
        }
        if (sourceFactIds.isEmpty()) {
            sourceFactIds = firstStringList(node.path("factIds"));
        }
        JsonNode sourceFact = sourceFactIds.isEmpty() ? null : sourceFacts.get(sourceFactIds.get(0));
        String chunkId = firstText(node, "chunk_id", "chunkId");
        JsonNode chunk = hasText(chunkId) ? chunks.get(chunkId) : null;
        List<String> entityNames = extractEntityNames(node.path("entities"));
        if (entityNames.isEmpty() && sourceFact != null) {
            entityNames = extractEntityNames(sourceFact.path("entities"));
        }
        List<String> tags = firstStringList(node.path("tags"));
        if (tags.isEmpty() && sourceFact != null) {
            tags = firstStringList(sourceFact.path("tags"));
        }
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("bankId", bankId);
        metadata.put("chunkId", chunkId);
        metadata.put("documentId", firstText(node, "document_id", "documentId"));
        metadata.put("context", firstText(node, "context"));
        if (sourceFact != null && sourceFact.isObject()) {
            metadata.put("sourceFactId", sourceFactIds.get(0));
            metadata.put("sourceFact", objectMap(sourceFact));
        }
        if (chunk != null && chunk.isObject()) {
            metadata.put("chunk", objectMap(chunk));
        }

        String summary = hasText(text) ? text : firstText(sourceFact, "text", "content");
        if (!hasText(summary)) {
            return null;
        }
        String subject = entityNames.isEmpty() ? "" : entityNames.get(0);
        String object = entityNames.size() > 1 ? entityNames.get(1) : "";
        String predicate = firstText(node, "context", "relation", "predicate", "type");
        if (!hasText(predicate)) {
            predicate = firstText(sourceFact, "context", "relation", "predicate", "type");
        }
        String createdAt = firstText(node, "date", "createdAt", "created_at", "occurredAt", "occurred_at");
        if (!hasText(createdAt)) {
            createdAt = firstText(sourceFact, "date", "createdAt", "created_at", "occurredAt", "occurred_at");
        }

        return new MemoryWorldFact(
                hasText(factId) ? factId : bankId + ":" + summary.hashCode(),
                firstText(node, "type"),
                subject,
                predicate,
                object,
                summary,
                firstDouble(node, "score", "confidence", "relevanceScore", "relevance_score"),
                hasText(firstText(sourceFact, "type")) ? firstText(sourceFact, "type") : "HINDSIGHT_RECALL",
                createdAt,
                tags,
                metadata
        );
    }

    private List<WikiRecallHit> deduplicateHits(List<WikiRecallHit> hits) {
        Map<String, WikiRecallHit> result = new LinkedHashMap<>();
        for (WikiRecallHit hit : hits) {
            WikiRecallHit existing = result.get(hit.documentId());
            if (existing == null || shouldReplaceHit(existing, hit)) {
                result.put(hit.documentId(), hit);
            }
        }
        return List.copyOf(result.values());
    }

    private List<MemoryWorldFact> deduplicateWorldFacts(List<MemoryWorldFact> facts) {
        Map<String, MemoryWorldFact> result = new LinkedHashMap<>();
        for (MemoryWorldFact fact : facts) {
            if (!hasText(fact.id()) && !hasText(fact.summary())) {
                continue;
            }
            String key = hasText(fact.id()) ? fact.id() : fact.summary();
            result.putIfAbsent(key, fact);
        }
        return List.copyOf(result.values());
    }

    private WikiRecallHit pickBestHit(List<WikiRecallHit> candidates) {
        WikiRecallHit best = new WikiRecallHit("", null, "", "", null);
        for (WikiRecallHit candidate : candidates) {
            if (candidate.documentId() == null || candidate.documentId().isBlank()) {
                continue;
            }
            if (best.documentId().isBlank() || shouldReplaceHit(best, candidate)) {
                best = candidate;
            }
        }
        return best;
    }

    private boolean shouldReplaceHit(WikiRecallHit existing, WikiRecallHit candidate) {
        if (existing == null) {
            return true;
        }
        if (candidate == null) {
            return false;
        }
        if (existing.score() == null && candidate.score() != null) {
            return true;
        }
        if (existing.score() != null && candidate.score() == null) {
            return false;
        }
        if (existing.score() != null && candidate.score() != null && candidate.score() > existing.score()) {
            return true;
        }
        if (!hasText(existing.snippet()) && hasText(candidate.snippet())) {
            return true;
        }
        if (!hasText(existing.title()) && hasText(candidate.title())) {
            return true;
        }
        return existing.pageId() == null && candidate.pageId() != null;
    }

    private String appendQuery(String url, Map<String, ?> params) {
        if (params == null || params.isEmpty()) {
            return url;
        }
        List<String> queryPairs = new ArrayList<>();
        for (Map.Entry<String, ?> entry : params.entrySet()) {
            if (!hasText(entry.getKey()) || entry.getValue() == null) {
                continue;
            }
            if (entry.getValue() instanceof Iterable<?> iterable) {
                for (Object item : iterable) {
                    String value = item == null ? "" : String.valueOf(item);
                    if (hasText(value)) {
                        queryPairs.add(encode(entry.getKey()) + "=" + encode(value));
                    }
                }
                continue;
            }
            String value = String.valueOf(entry.getValue());
            if (hasText(value)) {
                queryPairs.add(encode(entry.getKey()) + "=" + encode(value));
            }
        }
        if (queryPairs.isEmpty()) {
            return url;
        }
        return url + (url.contains("?") ? "&" : "?") + String.join("&", queryPairs);
    }

    private String firstText(JsonNode node, String... fieldNames) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return "";
        }
        for (String fieldName : fieldNames) {
            JsonNode value = node.path(fieldName);
            if (value.isTextual() && !value.asText("").isBlank()) {
                return value.asText("");
            }
        }
        return "";
    }

    private Integer firstInt(JsonNode node, String... fieldNames) {
        for (String fieldName : fieldNames) {
            JsonNode value = node.path(fieldName);
            if (value.canConvertToInt()) {
                return value.asInt();
            }
            if (value.isTextual()) {
                try {
                    return Integer.parseInt(value.asText(""));
                } catch (NumberFormatException ignored) {
                    // 继续尝试下一个字段。
                }
            }
        }
        return null;
    }

    private Long firstLong(JsonNode node, String... fieldNames) {
        for (String fieldName : fieldNames) {
            JsonNode value = node.path(fieldName);
            if (value.canConvertToLong()) {
                return value.asLong();
            }
            if (value.isTextual()) {
                try {
                    return Long.parseLong(value.asText(""));
                } catch (NumberFormatException ignored) {
                    // 继续尝试下一个字段。
                }
            }
        }
        return null;
    }

    private Double firstDouble(JsonNode node, String... fieldNames) {
        for (String fieldName : fieldNames) {
            JsonNode value = node.path(fieldName);
            if (value.isNumber()) {
                return value.asDouble();
            }
            if (value.isTextual()) {
                try {
                    return Double.parseDouble(value.asText(""));
                } catch (NumberFormatException ignored) {
                    // 继续尝试下一个字段。
                }
            }
        }
        return null;
    }

    private JsonNode firstArray(JsonNode node, String... fieldNames) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return null;
        }
        for (String fieldName : fieldNames) {
            JsonNode value = node.path(fieldName);
            if (value.isArray()) {
                return value;
            }
        }
        return null;
    }

    private List<String> firstStringList(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return List.of();
        }
        if (node.isTextual()) {
            return normalizeTags(List.of(node.asText("")));
        }
        if (!node.isArray()) {
            return List.of();
        }
        List<String> values = new ArrayList<>();
        for (JsonNode item : node) {
            if (item.isTextual()) {
                values.add(item.asText(""));
            } else if (item.isObject()) {
                String label = firstText(item, "name", "label", "id");
                if (hasText(label)) {
                    values.add(label);
                }
            }
        }
        return normalizeTags(values);
    }

    private List<String> extractEntityNames(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return List.of();
        }
        if (node.isTextual()) {
            return List.of(node.asText(""));
        }
        if (!node.isArray()) {
            return List.of();
        }
        List<String> names = new ArrayList<>();
        for (JsonNode item : node) {
            if (item.isTextual()) {
                names.add(item.asText(""));
            } else if (item.isObject()) {
                String name = firstText(item, "name", "label", "id", "canonicalName", "canonical_name");
                if (hasText(name)) {
                    names.add(name);
                }
            }
        }
        return normalizeTags(names);
    }

    private List<String> parseLooseStringList(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return List.of();
        }
        if (node.isTextual()) {
            String raw = node.asText("");
            if (!hasText(raw)) {
                return List.of();
            }
            List<String> values = new ArrayList<>();
            for (String item : raw.split(",")) {
                if (hasText(item)) {
                    values.add(item.trim());
                }
            }
            return normalizeTags(values);
        }
        return firstStringList(node);
    }

    private List<String> normalizeTags(List<String> tags) {
        LinkedHashSet<String> normalized = new LinkedHashSet<>();
        for (String tag : tags == null ? List.<String>of() : tags) {
            String value = defaultString(tag);
            if (!value.isBlank()) {
                normalized.add(value);
            }
        }
        return List.copyOf(normalized);
    }

    private Map<String, Object> objectMap(JsonNode node) {
        if (node == null || !node.isObject()) {
            return Map.of();
        }
        return objectMapper.convertValue(node, objectMapper.getTypeFactory().constructMapType(LinkedHashMap.class, String.class, Object.class));
    }

    private Map<String, JsonNode> objectFieldMap(JsonNode node) {
        if (node == null || !node.isObject()) {
            return Map.of();
        }
        LinkedHashMap<String, JsonNode> result = new LinkedHashMap<>();
        node.fields().forEachRemaining(entry -> result.put(entry.getKey(), entry.getValue()));
        return result;
    }

    private String encode(String value) {
        return URLEncoder.encode(value == null ? "" : value, StandardCharsets.UTF_8);
    }

    private String limitMessage(String value) {
        if (value == null || value.isBlank()) {
            return "未知错误";
        }
        String normalized = value.trim();
        String lowerCase = normalized.toLowerCase();
        if (lowerCase.contains("header parser received no bytes")
                || lowerCase.contains("remote end closed connection without response")
                || lowerCase.contains("connection refused")
                || lowerCase.contains("forcibly closed by the remote host")) {
            return "Hindsight 服务未正常就绪，请检查容器日志与 embeddings 配置";
        }
        return normalized.length() > 500 ? normalized.substring(0, 500) : normalized;
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private String defaultString(String value) {
        return value == null ? "" : value.trim();
    }

    /**
     * Hindsight 召回命中的轻量内部结构。
     */
    public record WikiRecallHit(
            String documentId,
            Long pageId,
            String title,
            String snippet,
            Double score
    ) {
    }

    /**
     * 记忆事实图的实体图骨架。
     */
    public record MemoryEntityGraph(
            List<MemoryEntityNode> nodes,
            List<MemoryEntityEdge> edges,
            List<MemoryTableRow> tableRows,
            Integer totalUnits
    ) {
        public MemoryEntityGraph(List<MemoryEntityNode> nodes, List<MemoryEntityEdge> edges) {
            this(nodes, edges, List.of(), null);
        }
    }

    /**
     * 实体图中的实体节点。
     */
    public record MemoryEntityNode(
            String id,
            String label,
            Integer mentionCount,
            String color,
            Map<String, Object> metadata
    ) {
    }

    /**
     * 实体图中的关系边。
     */
    public record MemoryEntityEdge(
            String id,
            String sourceId,
            String targetId,
            String relationType,
            Double weight,
            String lastSeenAt,
            Map<String, Object> metadata
    ) {
    }

    /**
     * Graph 接口中的表格行。
     * Table 模式优先使用这份结果，既能保留 Hindsight 原始排序，也能避免空 recall 查询被服务端拒绝。
     */
    public record MemoryTableRow(
            String id,
            String text,
            String context,
            String occurredStart,
            String occurredEnd,
            String mentionedAt,
            String date,
            List<String> entities,
            String documentId,
            String chunkId,
            String factType,
            List<String> tags,
            String createdAt,
            Integer proofCount,
            Map<String, Object> metadata
    ) {
    }

    /**
     * 单实体详情。
     */
    public record MemoryEntityDetail(
            String id,
            String canonicalName,
            Integer mentionCount,
            List<String> aliases,
            String firstSeenAt,
            String lastSeenAt,
            Map<String, Object> metadata,
            List<MemoryObservation> observations
    ) {
    }

    /**
     * Hindsight 返回的实体观察记录。
     */
    public record MemoryObservation(
            String text,
            String createdAt,
            Map<String, Object> metadata
    ) {
    }

    /**
     * 记忆事实面板使用的统一事实项。
     */
    public record MemoryWorldFact(
            String id,
            String type,
            String subject,
            String predicate,
            String object,
            String summary,
            Double confidence,
            String sourceType,
            String createdAt,
            List<String> tags,
            Map<String, Object> metadata
    ) {
    }
}
