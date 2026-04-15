package com.aiclub.platform.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
/**
 * 仓库规范扫描客户端。
 * 负责调用 code-processing 内部扫描接口，串起 clone、Semgrep、总结和打包流程。
 */
@Service
public class RepositoryScanClientService {

    private static final Logger log = LoggerFactory.getLogger(RepositoryScanClientService.class);

    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final String baseUrl;
    private final String internalServiceToken;

    public RepositoryScanClientService(ObjectMapper objectMapper,
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

    public PrepareScanResponse prepareScan(PrepareScanRequest requestPayload) {
        return post("/api/repo-scans/prepare", requestPayload, PrepareScanResponse.class);
    }

    public SemgrepResponse runSemgrep(String runKey,
                                      String rulesetCode,
                                      String rulesetName,
                                      String engineType,
                                      String rulesetContent) {
        return post("/api/repo-scans/semgrep", new SemgrepRequest(runKey, rulesetCode, rulesetName, engineType, rulesetContent), SemgrepResponse.class);
    }

    public NormalizeResponse normalizeScan(String runKey) {
        return post("/api/repo-scans/normalize", new RunKeyRequest(runKey), NormalizeResponse.class);
    }

    public SummarizeResponse summarizeScan(String runKey, String repoDisplayName) {
        return post("/api/repo-scans/summarize", new SummarizeRequest(runKey, repoDisplayName), SummarizeResponse.class);
    }

    public PackageScanResponse packageScan(PackageScanRequest requestPayload) {
        return post("/api/repo-scans/package", requestPayload, PackageScanResponse.class);
    }

    /**
     * 清理临时工作目录，失败只记录日志，不影响主流程结果。
     */
    public void cleanupScan(String runKey) {
        try {
            HttpRequest request = baseRequest("/api/repo-scans/" + runKey)
                    .DELETE()
                    .build();
            send(request);
        } catch (RuntimeException ignored) {
        }
    }

    private <T> T post(String path, Object payload, Class<T> responseType) {
        try {
            HttpRequest request = baseRequest(path)
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(payload), StandardCharsets.UTF_8))
                    .build();
            return objectMapper.readValue(send(request), responseType);
        } catch (IOException exception) {
            throw new IllegalStateException("调用代码扫描服务失败", exception);
        }
    }

    private String send(HttpRequest request) {
        try {
            log.info("调用代码扫描服务: method={}, uri={}", request.method(), request.uri());
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.statusCode() >= 200 && response.statusCode() < 300) {
                return response.body();
            }
            throw new IllegalStateException(buildErrorMessage(response.body(), response.statusCode()));
        } catch (IOException exception) {
            throw new IllegalStateException("调用代码扫描服务失败", exception);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("调用代码扫描服务被中断", exception);
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
                    return "代码扫描服务调用失败，HTTP " + statusCode + "：" + detailNode.asText();
                }
                return "代码扫描服务调用失败，HTTP " + statusCode + "：" + detailNode.toString();
            }
            if (node.hasNonNull("message")) {
                return "代码扫描服务调用失败，HTTP " + statusCode + "：" + node.get("message").asText();
            }
        } catch (Exception ignored) {
        }
        if (responseBody != null && !responseBody.isBlank()) {
            String normalizedBody = responseBody.trim();
            return "代码扫描服务调用失败，HTTP " + statusCode + "：" + (normalizedBody.length() > 500 ? normalizedBody.substring(0, 500) : normalizedBody);
        }
        return "代码扫描服务调用失败，HTTP " + statusCode;
    }

    private String trimSlash(String value) {
        String normalized = value == null ? "" : value.trim();
        while (normalized.endsWith("/")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        return normalized;
    }

    /**
     * clone 阶段请求体。
     */
    public record PrepareScanRequest(
            String runKey,
            String repoUrl,
            String apiBaseUrl,
            String projectRef,
            String branch,
            String authToken,
            String rulesetCode,
            String repoDisplayName
    ) {
    }

    public record PrepareScanResponse(
            String runKey,
            String repoPath,
            String branch,
            String commitSha,
            String repoDisplayName
    ) {
    }

    private record SemgrepRequest(
            String runKey,
            String rulesetCode,
            String rulesetName,
            String engineType,
            String rulesetContent
    ) {
    }

    private record RunKeyRequest(
            String runKey
    ) {
    }

    private record SummarizeRequest(
            String runKey,
            String repoDisplayName
    ) {
    }

    public record SemgrepResponse(
            Integer scannedFileCount,
            Integer totalFindings,
            Integer highCount,
            Integer mediumCount,
            Integer lowCount
    ) {
    }

    public record NormalizeResponse(
            String summaryText,
            Integer totalFindings,
            Integer highCount,
            Integer mediumCount,
            Integer lowCount
    ) {
    }

    public record SummarizeResponse(
            String reportMarkdown
    ) {
    }

    public record PackageScanRequest(
            String runKey,
            Long executionTaskId,
            Integer runNo
    ) {
    }

    public record PackageScanResponse(
            String summaryText,
            List<PackageArtifactResponse> artifacts
    ) {
    }

    public record PackageArtifactResponse(
            String artifactType,
            String title,
            String objectKey,
            String previewText
    ) {
    }
}
