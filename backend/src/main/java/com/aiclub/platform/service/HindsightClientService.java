package com.aiclub.platform.service;

import com.aiclub.platform.dto.WikiSemanticSearchResult;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Hindsight HTTP 客户端，负责 Wiki 文档 retain、recall 和删除。
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
        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("query", query == null ? "" : query);
        payload.put("limit", Math.max(1, Math.min(limit, 20)));
        payload.put("budget", properties.getRecallBudget());
        ArrayNode tags = payload.putArray("tags");
        tags.add("wiki");
        tags.add("project:" + projectId);
        try {
            HttpResponse<String> response = sendJsonRequest("POST", recallUrl(projectId), payload);
            JsonNode root = objectMapper.readTree(response.body());
            List<WikiRecallHit> hits = new ArrayList<>();
            collectRecallHits(root, hits);
            return deduplicateHits(hits);
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
        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("query", query == null ? "" : query);
        payload.put("limit", Math.max(1, Math.min(limit, 20)));
        payload.put("budget", properties.getRecallBudget());
        ArrayNode tags = payload.putArray("tags");
        tags.add("wiki");
        tags.add("space:" + spaceId);
        try {
            HttpResponse<String> response = sendJsonRequest("POST", spaceRecallUrl(spaceId), payload);
            JsonNode root = objectMapper.readTree(response.body());
            List<WikiRecallHit> hits = new ArrayList<>();
            collectRecallHits(root, hits);
            return deduplicateHits(hits);
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
        for (String tag : tags == null ? List.<String>of() : tags) {
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
        Double score = firstDouble(node, "score", "similarity", "distance");
        return new WikiRecallHit(documentId, pageId, title, snippet, score);
    }

    private List<WikiRecallHit> deduplicateHits(List<WikiRecallHit> hits) {
        Map<String, WikiRecallHit> result = new LinkedHashMap<>();
        for (WikiRecallHit hit : hits) {
            result.putIfAbsent(hit.documentId(), hit);
        }
        return List.copyOf(result.values());
    }

    private String firstText(JsonNode node, String... fieldNames) {
        for (String fieldName : fieldNames) {
            JsonNode value = node.path(fieldName);
            if (value.isTextual() && !value.asText("").isBlank()) {
                return value.asText("");
            }
        }
        return "";
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
        }
        return null;
    }

    private String encode(String value) {
        return java.net.URLEncoder.encode(value == null ? "" : value, StandardCharsets.UTF_8);
    }

    private String limitMessage(String value) {
        if (value == null || value.isBlank()) {
            return "未知错误";
        }
        String normalized = value.trim();
        return normalized.length() > 500 ? normalized.substring(0, 500) : normalized;
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
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
}
