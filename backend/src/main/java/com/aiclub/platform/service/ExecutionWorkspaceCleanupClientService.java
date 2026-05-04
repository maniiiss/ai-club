package com.aiclub.platform.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;

/**
 * 调用 code-processing 内部接口删除执行工作区。
 * backend 只负责生命周期编排，真正的目录删除委托给 code-processing 统一执行。
 */
@Service
public class ExecutionWorkspaceCleanupClientService {

    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final String baseUrl;
    private final InternalServiceAuthenticator internalServiceAuthenticator;

    @Autowired
    public ExecutionWorkspaceCleanupClientService(ObjectMapper objectMapper,
                                                  InternalServiceAuthenticator internalServiceAuthenticator,
                                                  @Value("${platform.code-processing.base-url}") String baseUrl) {
        this(
                objectMapper,
                internalServiceAuthenticator,
                baseUrl,
                HttpClient.newBuilder()
                        .version(HttpClient.Version.HTTP_1_1)
                        .connectTimeout(Duration.ofSeconds(10))
                        .build()
        );
    }

    ExecutionWorkspaceCleanupClientService(ObjectMapper objectMapper,
                                           InternalServiceAuthenticator internalServiceAuthenticator,
                                           String baseUrl,
                                           HttpClient httpClient) {
        this.objectMapper = objectMapper;
        this.internalServiceAuthenticator = internalServiceAuthenticator;
        this.baseUrl = trimSlash(baseUrl);
        this.httpClient = httpClient;
    }

    /**
     * 请求 code-processing 删除指定工作区根目录。
     */
    public void cleanupWorkspace(String workspaceRoot) {
        post("/api/execution-workspaces/cleanup", Map.of("workspaceRoot", workspaceRoot), 30);
    }

    private void post(String path, Object payload, int timeoutSeconds) {
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(baseUrl + path))
                    .timeout(Duration.ofSeconds(Math.max(timeoutSeconds, 5)))
                    .header("Authorization", internalServiceAuthenticator.authorizationHeaderValue())
                    .header("Accept", "application/json")
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(payload), StandardCharsets.UTF_8))
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new IllegalStateException(buildErrorMessage(response.body(), response.statusCode()));
            }
        } catch (IOException exception) {
            throw new IllegalStateException("调用执行工作区清理服务失败", exception);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("调用执行工作区清理服务被中断", exception);
        }
    }

    private String buildErrorMessage(String responseBody, int statusCode) {
        try {
            JsonNode node = objectMapper.readTree(responseBody == null ? "{}" : responseBody);
            if (node.hasNonNull("detail")) {
                JsonNode detailNode = node.get("detail");
                if (detailNode.isTextual()) {
                    return "执行工作区清理服务调用失败，HTTP " + statusCode + "：" + detailNode.asText();
                }
                return "执行工作区清理服务调用失败，HTTP " + statusCode + "：" + detailNode;
            }
        } catch (Exception ignored) {
        }
        if (responseBody != null && !responseBody.isBlank()) {
            return "执行工作区清理服务调用失败，HTTP " + statusCode + "：" + responseBody.trim();
        }
        return "执行工作区清理服务调用失败，HTTP " + statusCode;
    }

    private String trimSlash(String value) {
        String normalized = value == null ? "" : value.trim();
        while (normalized.endsWith("/")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        return normalized;
    }
}
