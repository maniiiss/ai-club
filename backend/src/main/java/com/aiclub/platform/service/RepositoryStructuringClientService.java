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
import java.util.List;

/**
 * 调用 code-processing 仓库结构化接口的客户端。
 * 该客户端只负责内部开发执行链路，不暴露给用户配置的 Agent。
 */
@Service
public class RepositoryStructuringClientService {

    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final String baseUrl;
    private final InternalServiceAuthenticator internalServiceAuthenticator;

    @Autowired
    public RepositoryStructuringClientService(ObjectMapper objectMapper,
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

    RepositoryStructuringClientService(ObjectMapper objectMapper,
                                       InternalServiceAuthenticator internalServiceAuthenticator,
                                       String baseUrl,
                                       HttpClient httpClient) {
        this.objectMapper = objectMapper;
        this.internalServiceAuthenticator = internalServiceAuthenticator;
        this.baseUrl = trimSlash(baseUrl);
        this.httpClient = httpClient;
    }

    /**
     * 异步启动仓库结构化会话。
     * 结构化步骤需要通过 runner session 回传日志和产物，因此这里直接走 start 接口。
     */
    public StructuringSessionAcceptedResponse startStructuring(RepositoryStructuringRequest requestPayload) {
        return post("/api/code/repo-structuring/start", requestPayload, StructuringSessionAcceptedResponse.class, 30);
    }

    private <T> T post(String path, Object payload, Class<T> responseType, int timeoutSeconds) {
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
            return objectMapper.readValue(response.body(), responseType);
        } catch (IOException exception) {
            throw new IllegalStateException("调用仓库结构化服务失败", exception);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("调用仓库结构化服务被中断", exception);
        }
    }

    private String buildErrorMessage(String responseBody, int statusCode) {
        try {
            JsonNode node = objectMapper.readTree(responseBody == null ? "{}" : responseBody);
            if (node.hasNonNull("detail")) {
                JsonNode detailNode = node.get("detail");
                if (detailNode.isTextual()) {
                    return "仓库结构化服务调用失败，HTTP " + statusCode + "：" + detailNode.asText();
                }
                return "仓库结构化服务调用失败，HTTP " + statusCode + "：" + detailNode.toString();
            }
        } catch (Exception ignored) {
        }
        if (responseBody != null && !responseBody.isBlank()) {
            return "仓库结构化服务调用失败，HTTP " + statusCode + "：" + responseBody.trim();
        }
        return "仓库结构化服务调用失败，HTTP " + statusCode;
    }

    private String trimSlash(String value) {
        String normalized = value == null ? "" : value.trim();
        while (normalized.endsWith("/")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        return normalized;
    }

    public record RepositoryStructuringRequest(
            String input,
            List<StructuringRepository> repositories,
            StructuringExecutionContext execution,
            Integer timeoutSeconds
    ) {
    }

    /**
     * 结构化请求里的仓库上下文与 Claude/Codex bridge 保持一致，并额外固定 commitSha。
     */
    public record StructuringRepository(
            String bindingId,
            String displayName,
            String projectRef,
            String projectPath,
            String repoUrl,
            String targetBranch,
            String commitSha,
            String apiBaseUrl,
            String authToken
    ) {
    }

    public record StructuringExecutionContext(
            String taskId,
            String runId,
            String stepId,
            String stepCode,
            String stepName,
            String projectId,
            String projectName,
            String sessionKey,
            String userId,
            String userName
    ) {
    }

    public record StructuringSessionAcceptedResponse(
            String sessionId,
            boolean accepted,
            String runnerType,
            String workspaceRoot,
            String startedAt
    ) {
    }
}
