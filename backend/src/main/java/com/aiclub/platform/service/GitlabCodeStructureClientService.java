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

/**
 * GitLab 仓库代码结构内部客户端。
 * 负责调用 code-processing 中的 GitNexus 结构化能力，并把结果回传给仓库快照服务。
 */
@Service
public class GitlabCodeStructureClientService {

    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final String baseUrl;
    private final InternalServiceAuthenticator internalServiceAuthenticator;

    @Autowired
    public GitlabCodeStructureClientService(ObjectMapper objectMapper,
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

    GitlabCodeStructureClientService(ObjectMapper objectMapper,
                                     InternalServiceAuthenticator internalServiceAuthenticator,
                                     String baseUrl,
                                     HttpClient httpClient) {
        this.objectMapper = objectMapper;
        this.internalServiceAuthenticator = internalServiceAuthenticator;
        this.baseUrl = trimSlash(baseUrl);
        this.httpClient = httpClient;
    }

    /**
     * 同步生成指定绑定仓库分支的概览结果。
     */
    public BuildOverviewResponse buildOverview(BuildOverviewRequest requestPayload) {
        return post("/api/code/gitlab-code-structure/overview", requestPayload, BuildOverviewResponse.class, 300);
    }

    /**
     * 同步执行仓库局部查询。
     */
    public QueryStructureResponse queryStructure(QueryStructureRequest requestPayload) {
        return post("/api/code/gitlab-code-structure/query", requestPayload, QueryStructureResponse.class, 120);
    }

    /**
     * 确保目标分支已 analyze，且 GitNexus serve 已经可用。
     */
    public LaunchContextResponse buildLaunchContext(LaunchContextRequest requestPayload) {
        return post("/api/code/gitnexus/launch-context", requestPayload, LaunchContextResponse.class, 300);
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
            throw new IllegalStateException("调用仓库代码结构服务失败", exception);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("调用仓库代码结构服务被中断", exception);
        }
    }

    private String buildErrorMessage(String responseBody, int statusCode) {
        try {
            JsonNode node = objectMapper.readTree(responseBody == null ? "{}" : responseBody);
            if (node.hasNonNull("detail")) {
                JsonNode detailNode = node.get("detail");
                if (detailNode.isTextual()) {
                    return "仓库代码结构服务调用失败，HTTP " + statusCode + "：" + detailNode.asText();
                }
                return "仓库代码结构服务调用失败，HTTP " + statusCode + "：" + detailNode.toString();
            }
        } catch (Exception ignored) {
        }
        if (responseBody != null && !responseBody.isBlank()) {
            return "仓库代码结构服务调用失败，HTTP " + statusCode + "：" + responseBody.trim();
        }
        return "仓库代码结构服务调用失败，HTTP " + statusCode;
    }

    private String trimSlash(String value) {
        String normalized = value == null ? "" : value.trim();
        while (normalized.endsWith("/")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        return normalized;
    }

    /**
     * 概览刷新请求。
     */
    public record BuildOverviewRequest(
            StructureRepository repository
    ) {
    }

    /**
     * 局部查询请求。
     */
    public record QueryStructureRequest(
            StructureRepository repository,
            String query
    ) {
    }

    /**
     * GitNexus 全仓图启动上下文请求。
     */
    public record LaunchContextRequest(
            StructureRepository repository
    ) {
    }

    /**
     * 内部结构化仓库上下文。
     * 这里固定携带分支、HTTP clone 地址和访问 Token，避免 code-processing 再去拼装绑定信息。
     */
    public record StructureRepository(
            String bindingId,
            String displayName,
            String projectRef,
            String projectPath,
            String repoUrl,
            String targetBranch,
            String apiBaseUrl,
            String authToken
    ) {
    }

    /**
     * 仓库概览生成结果。
     */
    public record BuildOverviewResponse(
            String branchName,
            String commitSha,
            Boolean degraded,
            Boolean truncated,
            String summaryMarkdown,
            String overviewJson,
            String graphJson,
            String lastErrorMessage
    ) {
    }

    /**
     * 仓库局部查询结果。
     */
    public record QueryStructureResponse(
            String branchName,
            String commitSha,
            Boolean degraded,
            Boolean truncated,
            String resultJson,
            String graphJson,
            String lastErrorMessage
    ) {
    }

    /**
     * GitNexus launch 所需的上下文。
     */
    public record LaunchContextResponse(
            String repoAlias,
            String branchName,
            String commitSha,
            Boolean serveReady
    ) {
    }
}
