package com.aiclub.platform.service;

import com.aiclub.platform.dto.CodeReviewResult;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
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
import java.util.ArrayList;
import java.util.List;

@Service
public class CodeReviewClientService {

    private static final Logger log = LoggerFactory.getLogger(CodeReviewClientService.class);

    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final String baseUrl;

    public CodeReviewClientService(ObjectMapper objectMapper,
                                   @Value("${platform.code-processing.base-url}") String baseUrl) {
        this.objectMapper = objectMapper;
        this.baseUrl = trimSlash(baseUrl);
        this.httpClient = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(Duration.ofSeconds(10))
                .build();
    }

    public CodeReviewResult reviewMergeRequest(ModelConfigService.ResolvedModelConfig modelConfig,
                                               String prompt,
                                               GitlabApiService.GitlabMergeRequest mergeRequest,
                                               GitlabApiService.GitlabMergeRequestChanges changes,
                                               List<String> previousIssues,
                                               String reviewStrictness) {
        try {
            ObjectNode payload = objectMapper.createObjectNode()
                    .put("provider", defaultString(modelConfig.provider()))
                    .put("apiBaseUrl", defaultString(modelConfig.apiBaseUrl()))
                    .put("apiKey", defaultString(modelConfig.apiKey()))
                    .put("model", defaultString(modelConfig.modelName()))
                    .put("openaiApiMode", defaultString(modelConfig.openaiApiMode()))
                    .put("prompt", defaultString(prompt))
                    .put("reviewStrictness", normalizeReviewStrictness(reviewStrictness))
                    .put("mergeRequestTitle", defaultString(mergeRequest.title()))
                    .put("mergeRequestDescription", defaultString(changes.description()));

            List<JsonNode> changeNodes = new ArrayList<>();
            for (GitlabApiService.GitlabChange change : changes.changes()) {
                ObjectNode node = objectMapper.createObjectNode()
                        .put("oldPath", defaultString(change.oldPath()))
                        .put("newPath", defaultString(change.newPath()))
                        .put("diff", defaultString(change.diff()))
                        .put("newFile", change.newFile())
                        .put("deletedFile", change.deletedFile())
                        .put("renamedFile", change.renamedFile());
                changeNodes.add(node);
            }
            payload.set("changes", objectMapper.valueToTree(changeNodes));
            payload.set("previousIssues", objectMapper.valueToTree(normalizeIssueList(previousIssues)));

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(baseUrl + "/api/code/review"))
                    .timeout(Duration.ofSeconds(60))
                    .header("Accept", "application/json")
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(payload), StandardCharsets.UTF_8))
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                log.warn("Code review HTTP call failed: status={}, provider={}, model={}, response={}",
                        response.statusCode(),
                        modelConfig.provider(),
                        modelConfig.modelName(),
                        abbreviate(response.body(), 1000));
                throw new IllegalStateException("Code Review \u670d\u52a1\u8c03\u7528\u5931\u8d25\uff0cHTTP \u72b6\u6001\u7801: "
                        + response.statusCode() + buildResponseMessage(response.body()));
            }

            JsonNode body = parseReviewBody(response.body());
            List<String> issues = readStringList(body, "issues");
            List<String> resolvedPreviousIssues = readStringList(body, "resolvedPreviousIssues");
            List<String> unresolvedPreviousIssues = readStringList(body, "unresolvedPreviousIssues");
            String summary = body.path("summary").asText("");
            String reviewMarkdown = body.path("reviewMarkdown").asText("");
            if (!hasText(reviewMarkdown)) {
                reviewMarkdown = buildFallbackMarkdown(summary, issues, previousIssues, resolvedPreviousIssues, unresolvedPreviousIssues);
            }
            return new CodeReviewResult(
                    body.path("approved").asBoolean(false),
                    summary,
                    body.path("provider").asText(defaultString(modelConfig.provider())),
                    issues,
                    reviewMarkdown,
                    resolvedPreviousIssues,
                    unresolvedPreviousIssues
            );
        } catch (IOException exception) {
            log.warn("Code review response parse failed: provider={}, model={}, message={}",
                    modelConfig.provider(),
                    modelConfig.modelName(),
                    exception.getMessage(),
                    exception);
            return buildRawFallbackResult(modelConfig, exception.getMessage(), previousIssues);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Code Review \u8c03\u7528\u88ab\u4e2d\u65ad", exception);
        }
    }

    private JsonNode parseReviewBody(String responseBody) throws IOException {
        String normalized = defaultString(responseBody).trim();
        if (!hasText(normalized)) {
            throw new IOException("Code Review 服务返回空响应");
        }

        try {
            return objectMapper.readTree(normalized);
        } catch (IOException ignored) {
        }

        if (normalized.startsWith("```")) {
            String[] lines = normalized.split("\\R");
            if (lines.length >= 3) {
                StringBuilder builder = new StringBuilder();
                for (int index = 1; index < lines.length - 1; index++) {
                    if (builder.length() > 0) {
                        builder.append('\n');
                    }
                    builder.append(lines[index]);
                }
                normalized = builder.toString().trim();
                try {
                    return objectMapper.readTree(normalized);
                } catch (IOException ignored) {
                }
            }
        }

        for (int index = 0; index < normalized.length(); index++) {
            if (normalized.charAt(index) != '{') {
                continue;
            }
            try {
                return objectMapper.readTree(normalized.substring(index));
            } catch (IOException ignored) {
            }
        }

        throw new IOException("Code Review 服务返回了非 JSON 响应: " + abbreviate(normalized, 500));
    }

    private CodeReviewResult buildRawFallbackResult(ModelConfigService.ResolvedModelConfig modelConfig,
                                                    String message,
                                                    List<String> previousIssues) {
        String summary = hasText(message) ? "Code Review 返回非标准 JSON，已降级展示原始信息" : "Code Review 结果解析失败";
        List<String> issues = hasText(message) ? List.of(limitMessage(message)) : List.of();
        return new CodeReviewResult(
                false,
                summary,
                defaultString(modelConfig.provider()),
                issues,
                buildFallbackMarkdown(summary, issues, previousIssues, List.of(), List.of()),
                List.of(),
                List.of()
        );
    }

    /**
     * 当 code-processing 未返回 Markdown 时，由 backend 补一份包含历史问题修复情况的兜底说明。
     */
    private String buildFallbackMarkdown(String summary,
                                         List<String> issues,
                                         List<String> previousIssues,
                                         List<String> resolvedPreviousIssues,
                                         List<String> unresolvedPreviousIssues) {
        StringBuilder builder = new StringBuilder();
        builder.append("# Code Review\n\n");
        builder.append("## \u603b\u7ed3\n");
        builder.append(hasText(summary) ? summary : "\u672a\u63d0\u4f9b\u6458\u8981").append("\n\n");
        builder.append("## \u5386\u53f2\u95ee\u9898\u4fee\u590d\u60c5\u51b5\n");
        appendIssueSection(builder, "### \u4e0a\u6b21\u5e26\u5165\u95ee\u9898", previousIssues);
        appendIssueSection(builder, "### \u5df2\u786e\u8ba4\u4fee\u590d", resolvedPreviousIssues);
        appendIssueSection(builder, "### \u4ecd\u672a\u4fee\u590d", unresolvedPreviousIssues);
        builder.append("\n## \u5f53\u524d\u4ecd\u9700\u5904\u7406\u7684\u95ee\u9898\n");
        if (issues == null || issues.isEmpty()) {
            builder.append("- \u672a\u8bc6\u522b\u5230\u660e\u786e\u95ee\u9898\n");
        } else {
            for (String issue : issues) {
                builder.append("- ").append(issue).append("\n");
            }
        }
        return builder.toString();
    }

    private List<String> readStringList(JsonNode body, String fieldName) {
        List<String> values = new ArrayList<>();
        JsonNode node = body.path(fieldName);
        if (!node.isArray()) {
            return values;
        }
        for (JsonNode item : node) {
            String value = item.asText("");
            if (hasText(value)) {
                values.add(value.trim());
            }
        }
        return values;
    }

    private void appendIssueSection(StringBuilder builder, String title, List<String> issues) {
        builder.append(title).append("\n");
        if (issues == null || issues.isEmpty()) {
            builder.append("- \u65e0\n\n");
            return;
        }
        for (String issue : issues) {
            builder.append("- ").append(issue).append("\n");
        }
        builder.append("\n");
    }

    private List<String> normalizeIssueList(List<String> issues) {
        if (issues == null || issues.isEmpty()) {
            return List.of();
        }
        List<String> values = new ArrayList<>();
        for (String issue : issues) {
            if (hasText(issue)) {
                values.add(issue.trim());
            }
        }
        return values;
    }

    /**
     * 统一兜底审查严格度，保障旧调用链或旧配置不会传出空值。
     */
    private String normalizeReviewStrictness(String value) {
        if (!hasText(value)) {
            return "MEDIUM";
        }
        String normalized = value.trim().toUpperCase();
        if ("HIGH".equals(normalized) || "MEDIUM".equals(normalized) || "LOW".equals(normalized)) {
            return normalized;
        }
        return "MEDIUM";
    }

    private String buildResponseMessage(String responseBody) {
        if (!hasText(responseBody)) {
            return "";
        }
        String message = responseBody.trim();
        try {
            JsonNode node = objectMapper.readTree(responseBody);
            JsonNode detailNode = node.path("detail");
            if (detailNode.isArray() && !detailNode.isEmpty()) {
                message = detailNode.toString();
            } else if (node.hasNonNull("message")) {
                message = node.get("message").asText(message);
            }
        } catch (Exception ignored) {
        }
        return "\uff0c\u54cd\u5e94: " + abbreviate(message, 500);
    }

    private String abbreviate(String value, int maxLength) {
        if (!hasText(value) || value.length() <= maxLength) {
            return value;
        }
        return value.substring(0, maxLength) + "...";
    }

    private String limitMessage(String value) {
        if (!hasText(value)) {
            return "";
        }
        String trimmed = value.trim();
        return trimmed.length() <= 500 ? trimmed : trimmed.substring(0, 500);
    }

    private String defaultString(String value) {
        return value == null ? "" : value;
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private String trimSlash(String value) {
        String result = value == null ? "" : value.trim();
        while (result.endsWith("/")) {
            result = result.substring(0, result.length() - 1);
        }
        return result;
    }
}
