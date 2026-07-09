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
 * 业主仓库镜像推送内部客户端。
 * 负责调用 code-processing 的镜像推送接口，把源仓库分支完整推送到业主仓库。
 * 推送是长任务（clone + push），超时设为 600 秒。
 */
@Service
public class OwnerRepoPushClientService {

    private static final int PUSH_TIMEOUT_SECONDS = 600;

    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final String baseUrl;
    private final InternalServiceAuthenticator internalServiceAuthenticator;

    @Autowired
    public OwnerRepoPushClientService(ObjectMapper objectMapper,
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

    OwnerRepoPushClientService(ObjectMapper objectMapper,
                               InternalServiceAuthenticator internalServiceAuthenticator,
                               String baseUrl,
                               HttpClient httpClient) {
        this.objectMapper = objectMapper;
        this.internalServiceAuthenticator = internalServiceAuthenticator;
        this.baseUrl = trimSlash(baseUrl);
        this.httpClient = httpClient;
    }

    /**
     * 调用 code-processing 执行镜像推送。
     *
     * @param sourceRepoUrl    源仓库 HTTP Clone 地址
     * @param sourceAuthToken  源仓库访问 Token（明文）
     * @param sourceBranch     源分支
     * @param targetRepoUrl    业主仓库 HTTP Clone 地址
     * @param targetAuthToken  业主仓库访问 Token（明文）
     * @param targetBranch     目标分支
     * @param pushMode         推送方式 DIRECT / NEW_BRANCH / MERGE_REQUEST
     * @return 推送结果（源/目标 commit SHA、实际推送分支、策略）
     */
    public MirrorPushResponse mirrorPush(String sourceRepoUrl,
                                         String sourceAuthToken,
                                         String sourceBranch,
                                         String targetRepoUrl,
                                         String targetAuthToken,
                                         String targetBranch,
                                         String pushMode) {
        MirrorPushRequest payload = new MirrorPushRequest(
                sourceRepoUrl, sourceAuthToken, sourceBranch,
                targetRepoUrl, targetAuthToken, targetBranch, pushMode
        );
        return post("/api/code/owner-repo-push/mirror", payload, MirrorPushResponse.class, PUSH_TIMEOUT_SECONDS);
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
            throw new IllegalStateException("调用业主仓库推送服务失败", exception);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("调用业主仓库推送服务被中断", exception);
        }
    }

    private String buildErrorMessage(String responseBody, int statusCode) {
        try {
            JsonNode node = objectMapper.readTree(responseBody == null ? "{}" : responseBody);
            if (node.hasNonNull("detail")) {
                JsonNode detailNode = node.get("detail");
                if (detailNode.isTextual()) {
                    return "业主仓库推送服务调用失败，HTTP " + statusCode + "：" + detailNode.asText();
                }
                return "业主仓库推送服务调用失败，HTTP " + statusCode + "：" + detailNode.toString();
            }
        } catch (Exception ignored) {
        }
        if (responseBody != null && !responseBody.isBlank()) {
            return "业主仓库推送服务调用失败，HTTP " + statusCode + "：" + responseBody.trim();
        }
        return "业主仓库推送服务调用失败，HTTP " + statusCode;
    }

    private String trimSlash(String value) {
        String normalized = value == null ? "" : value.trim();
        while (normalized.endsWith("/")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        return normalized;
    }

    /**
     * 镜像推送请求体，与 code-processing 的 OwnerRepoMirrorPushRequest 对齐。
     */
    public record MirrorPushRequest(
            String sourceRepoUrl,
            String sourceAuthToken,
            String sourceBranch,
            String targetRepoUrl,
            String targetAuthToken,
            String targetBranch,
            String pushMode
    ) {
    }

    /**
     * 镜像推送响应体，与 code-processing 的 OwnerRepoMirrorPushResponse 对齐。
     */
    public record MirrorPushResponse(
            String sourceCommitSha,
            String targetCommitSha,
            String pushedBranch,
            String strategy
    ) {
    }
}
