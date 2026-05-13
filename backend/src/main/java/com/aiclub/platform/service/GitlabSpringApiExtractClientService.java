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
 * GitLab Spring 接口抽取内部客户端。
 * 负责调用 code-processing，把绑定仓库源码转换成可同步到 Yaade 的接口清单。
 */
@Service
public class GitlabSpringApiExtractClientService {

    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final String baseUrl;
    private final InternalServiceAuthenticator internalServiceAuthenticator;

    @Autowired
    public GitlabSpringApiExtractClientService(ObjectMapper objectMapper,
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

    GitlabSpringApiExtractClientService(ObjectMapper objectMapper,
                                        InternalServiceAuthenticator internalServiceAuthenticator,
                                        String baseUrl,
                                        HttpClient httpClient) {
        this.objectMapper = objectMapper;
        this.internalServiceAuthenticator = internalServiceAuthenticator;
        this.baseUrl = trimSlash(baseUrl);
        this.httpClient = httpClient;
    }

    /**
     * 同步抽取指定仓库分支里的 Spring REST 接口。
     */
    public ExtractResponse extract(ExtractRequest requestPayload) {
        return post("/api/code/gitlab-spring-apis/extract", requestPayload, ExtractResponse.class, 300);
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
            throw new IllegalStateException("调用 Spring 接口抽取服务失败", exception);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("调用 Spring 接口抽取服务被中断", exception);
        }
    }

    private String buildErrorMessage(String responseBody, int statusCode) {
        try {
            JsonNode node = objectMapper.readTree(responseBody == null ? "{}" : responseBody);
            if (node.hasNonNull("detail")) {
                JsonNode detailNode = node.get("detail");
                if (detailNode.isTextual()) {
                    return "Spring 接口抽取服务调用失败，HTTP " + statusCode + "：" + detailNode.asText();
                }
                return "Spring 接口抽取服务调用失败，HTTP " + statusCode + "：" + detailNode;
            }
        } catch (Exception ignored) {
        }
        if (responseBody != null && !responseBody.isBlank()) {
            return "Spring 接口抽取服务调用失败，HTTP " + statusCode + "：" + responseBody.trim();
        }
        return "Spring 接口抽取服务调用失败，HTTP " + statusCode;
    }

    private String trimSlash(String value) {
        String normalized = value == null ? "" : value.trim();
        while (normalized.endsWith("/")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        return normalized;
    }

    /**
     * Spring 接口抽取请求。
     */
    public record ExtractRequest(
            /**
             * 由 backend 组装好的仓库 clone 上下文。
             */
            GitlabCodeStructureClientService.StructureRepository repository
    ) {
    }

    /**
     * Spring 接口抽取响应。
     */
    public record ExtractResponse(
            /**
             * 实际读取的分支名称。
             */
            String branchName,
            /**
             * 当前分支提交 SHA。
             */
            String commitSha,
            /**
             * 扫描的 Java 文件数。
             */
            int scannedCount,
            /**
             * 抽取出的接口清单。
             */
            List<ExtractedEndpoint> endpoints,
            /**
             * 非阻断告警。
             */
            List<String> warnings
    ) {
    }

    /**
     * 抽取出的单个 Spring REST 接口。
     */
    public record ExtractedEndpoint(
            /**
             * HTTP 方法。
             */
            String method,
            /**
             * 归一化后的接口路径。
             */
            String path,
            /**
             * 接口展示名称，优先来自源码注释。
             */
            String name,
            /**
             * 接口详情说明，供 Yaade 描述字段使用。
             */
            String description,
            /**
             * 请求头参数。
             */
            List<ExtractedParameter> headers,
            /**
             * 查询参数。
             */
            List<ExtractedParameter> queryParams,
            /**
             * 路径参数。
             */
            List<ExtractedParameter> pathParams,
            /**
             * 请求体内容类型。
             */
            String requestContentType,
            /**
             * 请求体 JSON 示例。
             */
            String bodyExample,
            /**
             * 源码文件相对路径。
             */
            String sourceFile,
            /**
             * Controller 方法起始行号。
             */
            Integer sourceLine,
            /**
             * 源码签名，用于生成项追踪。
             */
            String sourceSignature
    ) {
    }

    /**
     * 抽取出的接口参数说明。
     */
    public record ExtractedParameter(
            /**
             * 参数名称。
             */
            String name,
            /**
             * Java 参数类型。
             */
            String type,
            /**
             * 是否必填。
             */
            boolean required,
            /**
             * 默认值。
             */
            String defaultValue,
            /**
             * 参数说明。
             */
            String description
    ) {
    }
}
