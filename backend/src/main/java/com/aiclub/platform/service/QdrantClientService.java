package com.aiclub.platform.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Qdrant HTTP 客户端。
 * 业务意图：把 collection 生命周期、point upsert/search/delete 的协议细节收口，避免 Wiki 服务层直接拼 Qdrant 请求体。
 */
@Service
public class QdrantClientService {

    private static final Logger log = LoggerFactory.getLogger(QdrantClientService.class);

    private final WikiKnowledgeProperties properties;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    public QdrantClientService(WikiKnowledgeProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(properties.getQdrantTimeoutSeconds()))
                .version(HttpClient.Version.HTTP_1_1)
                .build();
    }

    public void recreateCollection(String collectionName, int vectorSize) {
        deleteCollectionQuietly(collectionName);
        createCollection(collectionName, vectorSize);
    }

    public void createCollection(String collectionName, int vectorSize) {
        ObjectNode payload = objectMapper.createObjectNode();
        ObjectNode vectors = payload.putObject("vectors");
        vectors.put("size", Math.max(1, vectorSize));
        vectors.put("distance", "Cosine");
        sendJson("PUT", collectionUrl(collectionName), payload);
    }

    public void upsertPoints(String collectionName, List<QdrantPoint> points) {
        if (points == null || points.isEmpty()) {
            return;
        }
        ObjectNode payload = objectMapper.createObjectNode();
        ArrayNode array = payload.putArray("points");
        for (QdrantPoint point : points) {
            ObjectNode node = array.addObject();
            node.put("id", qdrantPointId(point.id()));
            ArrayNode vector = node.putArray("vector");
            for (Double value : point.vector()) {
                vector.add(value == null ? 0d : value);
            }
            node.set("payload", objectMapper.valueToTree(point.payload()));
        }
        sendJson("PUT", collectionUrl(collectionName) + "/points?wait=true", payload);
    }

    public void deletePointsByFilter(String collectionName, Map<String, Object> equalsFilter) {
        if (equalsFilter == null || equalsFilter.isEmpty()) {
            return;
        }
        ObjectNode payload = objectMapper.createObjectNode();
        payload.set("filter", buildFilter(equalsFilter));
        sendJson("POST", collectionUrl(collectionName) + "/points/delete?wait=true", payload);
    }

    public List<QdrantSearchHit> search(String collectionName,
                                        List<Double> vector,
                                        Map<String, Object> equalsFilter,
                                        int limit) {
        if (vector == null || vector.isEmpty()) {
            return List.of();
        }
        ObjectNode payload = objectMapper.createObjectNode();
        ArrayNode vectorNode = payload.putArray("vector");
        for (Double value : vector) {
            vectorNode.add(value == null ? 0d : value);
        }
        payload.put("limit", Math.max(1, limit));
        if (equalsFilter != null && !equalsFilter.isEmpty()) {
            payload.set("filter", buildFilter(equalsFilter));
        }
        try {
            HttpResponse<String> response = sendJson("POST", collectionUrl(collectionName) + "/points/search", payload);
            JsonNode root = objectMapper.readTree(response.body());
            List<QdrantSearchHit> hits = new ArrayList<>();
            for (JsonNode item : root.path("result")) {
                Map<String, Object> resultPayload = objectMapper.convertValue(item.path("payload"), Map.class);
                hits.add(new QdrantSearchHit(
                        firstText(item, "id"),
                        item.path("score").isNumber() ? item.path("score").asDouble() : null,
                        resultPayload
                ));
            }
            return List.copyOf(hits);
        } catch (IOException exception) {
            throw new IllegalStateException("解析 Qdrant 检索结果失败", exception);
        } catch (RuntimeException exception) {
            if (exception.getMessage() != null && exception.getMessage().contains("HTTP 404")) {
                log.warn("Qdrant collection 不存在，跳过本次检索：{}", collectionName);
                return List.of();
            }
            throw exception;
        }
    }

    private void deleteCollectionQuietly(String collectionName) {
        try {
            sendJson("DELETE", collectionUrl(collectionName), null);
        } catch (RuntimeException exception) {
            if (exception.getMessage() == null || !exception.getMessage().contains("HTTP 404")) {
                log.warn("删除 Qdrant collection 失败，collection={}，message={}", collectionName, exception.getMessage());
            }
        }
    }

    private ObjectNode buildFilter(Map<String, Object> equalsFilter) {
        ObjectNode filter = objectMapper.createObjectNode();
        ArrayNode must = filter.putArray("must");
        for (Map.Entry<String, Object> entry : equalsFilter.entrySet()) {
            ObjectNode condition = must.addObject();
            condition.put("key", entry.getKey());
            ObjectNode match = condition.putObject("match");
            Object value = entry.getValue();
            if (value instanceof Number number) {
                match.put("value", number.doubleValue());
            } else if (value instanceof Boolean bool) {
                match.put("value", bool);
            } else {
                match.put("value", value == null ? "" : String.valueOf(value));
            }
        }
        return filter;
    }

    private HttpResponse<String> sendJson(String method, String url, JsonNode payload) {
        try {
            HttpRequest.Builder builder = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(Duration.ofSeconds(properties.getQdrantTimeoutSeconds()))
                    .header("Content-Type", "application/json");
            if (!properties.getQdrantApiKey().isBlank()) {
                builder.header("api-key", properties.getQdrantApiKey());
            }
            HttpRequest request;
            if ("DELETE".equalsIgnoreCase(method)) {
                request = builder.DELETE().build();
            } else if ("PUT".equalsIgnoreCase(method)) {
                request = builder.PUT(HttpRequest.BodyPublishers.ofString(writeJson(payload), StandardCharsets.UTF_8)).build();
            } else if ("POST".equalsIgnoreCase(method)) {
                request = builder.POST(HttpRequest.BodyPublishers.ofString(writeJson(payload), StandardCharsets.UTF_8)).build();
            } else {
                throw new IllegalArgumentException("不支持的 Qdrant 请求方法: " + method);
            }
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.statusCode() == 409 && "PUT".equalsIgnoreCase(method) && isCollectionUrl(url)) {
                return response;
            }
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new IllegalStateException("Qdrant 调用失败，HTTP " + response.statusCode() + "：" + response.body());
            }
            return response;
        } catch (IOException | InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Qdrant 请求失败：" + exception.getMessage(), exception);
        }
    }

    private String writeJson(JsonNode payload) throws IOException {
        return objectMapper.writeValueAsString(payload == null ? objectMapper.createObjectNode() : payload);
    }

    private String collectionUrl(String collectionName) {
        return properties.getQdrantBaseUrl() + "/collections/" + urlEncode(collectionName);
    }

    private boolean isCollectionUrl(String url) {
        String base = properties.getQdrantBaseUrl() + "/collections/";
        return url != null && url.startsWith(base) && !url.substring(base.length()).contains("/");
    }

    private String qdrantPointId(String logicalId) {
        return UUID.nameUUIDFromBytes(defaultString(logicalId).getBytes(StandardCharsets.UTF_8)).toString();
    }

    private String urlEncode(String value) {
        return URLEncoder.encode(value == null ? "" : value, StandardCharsets.UTF_8);
    }

    private String firstText(JsonNode node, String field) {
        JsonNode value = node.path(field);
        return value.isMissingNode() || value.isNull() ? "" : value.asText("");
    }

    private String defaultString(String value) {
        return value == null ? "" : value.trim();
    }

    public record QdrantPoint(String id, List<Double> vector, Map<String, Object> payload) {
    }

    public record QdrantSearchHit(String id, Double score, Map<String, Object> payload) {
    }
}
