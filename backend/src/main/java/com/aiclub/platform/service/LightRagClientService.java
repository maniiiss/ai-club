package com.aiclub.platform.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;

/**
 * LightRAG 客户端。
 * 负责调用 code-processing 的 LightRAG 接口，串起 Wiki 摄入、检索与图谱读取。
 * 实现风格对齐 RepositoryScanClientService，统一走内部 Bearer token 鉴权。
 */
@Service
public class LightRagClientService {

    private static final Logger log = LoggerFactory.getLogger(LightRagClientService.class);

    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final String baseUrl;
    private final String internalServiceToken;

    public LightRagClientService(ObjectMapper objectMapper,
                                 @Value("${platform.code-processing.base-url}") String baseUrl,
                                 @Value("${platform.internal.service-token}") String internalServiceToken) {
        this.objectMapper = objectMapper;
        this.baseUrl = trimSlash(baseUrl);
        this.internalServiceToken = internalServiceToken == null ? "" : internalServiceToken.trim();
        this.httpClient = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(Duration.ofSeconds(10))
                .build();
    }

    /**
     * 摄入 Wiki 页面正文，由 code-processing 调 LightRAG insert 走 LLM 抽取。
     */
    public void ingestWikiPage(String namespace, Long pageId, String content) {
        post("/api/lightrag/ingest/wiki",
                new IngestWikiRequest(namespace, pageId, content), Void.class);
    }

    /**
     * 删除 Wiki 页面对应的 LightRAG 实体（按 source_id 清理三后端）。
     */
    public void deleteWikiPage(String namespace, Long pageId) {
        HttpRequest request = baseRequest("/api/lightrag/ingest/wiki?namespace=" + encode(namespace) + "&pageId=" + pageId)
                .DELETE()
                .build();
        send(request);
    }

    /**
     * 调 LightRAG query 检索，返回 Markdown 证据文本。
     */
    public LightRagQueryResponse query(String namespace, String query, String mode, int topK) {
        return post("/api/lightrag/query",
                new QueryRequest(namespace, query, mode, topK), LightRagQueryResponse.class);
    }

    /**
     * 读取 LightRAG 图谱数据（Neo4j 直读），供可视化画布使用。
     */
    public LightRagGraphResponse getGraph(String namespace, int nodeLimit) {
        return get("/api/lightrag/graph?namespace=" + encode(namespace) + "&nodeLimit=" + nodeLimit,
                LightRagGraphResponse.class);
    }

    /**
     * 探测 code-processing LightRAG 依赖的三后端连通性。
     */
    public LightRagHealthResponse health() {
        return get("/api/lightrag/health", LightRagHealthResponse.class);
    }

    private <T> T post(String path, Object payload, Class<T> responseType) {
        try {
            HttpRequest request = baseRequest(path)
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(payload), StandardCharsets.UTF_8))
                    .build();
            String body = send(request);
            if (responseType == Void.class) {
                return null;
            }
            return objectMapper.readValue(body, responseType);
        } catch (IOException exception) {
            throw new IllegalStateException("调用 LightRAG 服务失败", exception);
        }
    }

    private <T> T get(String path, Class<T> responseType) {
        try {
            HttpRequest request = baseRequest(path).GET().build();
            String body = send(request);
            return objectMapper.readValue(body, responseType);
        } catch (IOException exception) {
            throw new IllegalStateException("调用 LightRAG 服务失败", exception);
        }
    }

    private String send(HttpRequest request) {
        try {
            log.info("调用 LightRAG 服务: method={}, uri={}", request.method(), request.uri());
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.statusCode() >= 200 && response.statusCode() < 300) {
                return response.body();
            }
            throw new IllegalStateException(buildErrorMessage(response.body(), response.statusCode()));
        } catch (IOException exception) {
            throw new IllegalStateException("调用 LightRAG 服务失败", exception);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("调用 LightRAG 服务被中断", exception);
        }
    }

    private HttpRequest.Builder baseRequest(String path) {
        return HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + path))
                .timeout(Duration.ofSeconds(120))
                .header("Accept", "application/json")
                .header("Authorization", "Bearer " + internalServiceToken);
    }

    /**
     * 尽量从错误响应中提取 detail/message，避免前端只能看到 HTTP 状态码。
     */
    private String buildErrorMessage(String responseBody, int statusCode) {
        try {
            var node = objectMapper.readTree(responseBody);
            if (node.hasNonNull("detail")) {
                var detailNode = node.get("detail");
                if (detailNode.isTextual()) {
                    return "LightRAG 服务调用失败，HTTP " + statusCode + "：" + detailNode.asText();
                }
                return "LightRAG 服务调用失败，HTTP " + statusCode + "：" + detailNode.toString();
            }
            if (node.hasNonNull("message")) {
                return "LightRAG 服务调用失败，HTTP " + statusCode + "：" + node.get("message").asText();
            }
        } catch (Exception ignored) {
        }
        if (responseBody != null && !responseBody.isBlank()) {
            String normalizedBody = responseBody.trim();
            return "LightRAG 服务调用失败，HTTP " + statusCode + "：" + (normalizedBody.length() > 500 ? normalizedBody.substring(0, 500) : normalizedBody);
        }
        return "LightRAG 服务调用失败，HTTP " + statusCode;
    }

    private String trimSlash(String value) {
        String normalized = value == null ? "" : value.trim();
        while (normalized.endsWith("/")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        return normalized;
    }

    private String encode(String value) {
        return java.net.URLEncoder.encode(value == null ? "" : value, StandardCharsets.UTF_8);
    }

    public record IngestWikiRequest(String namespace, Long pageId, String content) {
    }

    public record QueryRequest(String namespace, String query, String mode, int topK) {
    }

    public record LightRagQueryResponse(String namespace, String mode, String answer, List<String> contexts) {
    }

    public record LightRagGraphResponse(String namespace, List<GraphNode> nodes, List<GraphEdge> edges) {
    }

    public record GraphNode(String id, String name, String type, String description, String sourceId) {
    }

    public record GraphEdge(String from, String to, String type, String description, Double weight) {
    }

    public record LightRagHealthResponse(boolean enabled, boolean neo4j, boolean qdrant, boolean pgKv, String message) {
    }
}
