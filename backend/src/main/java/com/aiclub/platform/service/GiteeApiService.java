package com.aiclub.platform.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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
import java.util.List;
import java.util.Map;

/**
 * Gitee OpenAPI 轻量客户端。
 * 第一版只覆盖项目、里程碑、工作项查询能力，供绑定与手动同步复用。
 */
@Service
public class GiteeApiService {

    private static final int PAGE_SIZE = 100;

    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    public GiteeApiService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .build();
    }

    public List<GiteeProgram> listPrograms(String apiBaseUrl, String accessToken, Long enterpriseId) {
        List<GiteeProgram> items = new ArrayList<>();
        int page = 1;
        while (true) {
            JsonNode arrayNode = sendJsonGet(buildUrl(
                    normalizeBaseUrl(apiBaseUrl) + "/" + enterpriseId + "/programs",
                    Map.of(
                            "access_token", accessToken,
                            "page", String.valueOf(page),
                            "per_page", String.valueOf(PAGE_SIZE)
                    )
            ));
            int currentSize = 0;
            if (arrayNode.isArray()) {
                for (JsonNode node : arrayNode) {
                    items.add(toProgram(node));
                    currentSize++;
                }
            }
            if (currentSize < PAGE_SIZE) {
                return items;
            }
            page++;
        }
    }

    public GiteeProgram fetchProgram(String apiBaseUrl, String accessToken, Long enterpriseId, Long programId) {
        JsonNode node = sendJsonGet(buildUrl(
                normalizeBaseUrl(apiBaseUrl) + "/" + enterpriseId + "/programs/" + programId,
                Map.of("access_token", accessToken)
        ));
        return toProgram(node);
    }

    public List<GiteeMilestone> listMilestones(String apiBaseUrl, String accessToken, Long enterpriseId, Long programId) {
        List<GiteeMilestone> items = new ArrayList<>();
        int page = 1;
        while (true) {
            JsonNode arrayNode = sendJsonGet(buildUrl(
                    normalizeBaseUrl(apiBaseUrl) + "/" + enterpriseId + "/milestones",
                    Map.of(
                            "access_token", accessToken,
                            "program_id", String.valueOf(programId),
                            "page", String.valueOf(page),
                            "per_page", String.valueOf(PAGE_SIZE)
                    )
            ));
            int currentSize = 0;
            if (arrayNode.isArray()) {
                for (JsonNode node : arrayNode) {
                    items.add(toMilestone(node));
                    currentSize++;
                }
            }
            if (currentSize < PAGE_SIZE) {
                return items;
            }
            page++;
        }
    }

    public List<GiteeIssue> listIssues(String apiBaseUrl,
                                       String accessToken,
                                       Long enterpriseId,
                                       Long programId,
                                       Long milestoneId) {
        List<GiteeIssue> items = new ArrayList<>();
        int page = 1;
        while (true) {
            JsonNode arrayNode = sendJsonGet(buildUrl(
                    normalizeBaseUrl(apiBaseUrl) + "/" + enterpriseId + "/issues",
                    Map.of(
                            "access_token", accessToken,
                            "program_id", String.valueOf(programId),
                            "milestone_id", String.valueOf(milestoneId),
                            "page", String.valueOf(page),
                            "per_page", String.valueOf(PAGE_SIZE)
                    )
            ));
            int currentSize = 0;
            if (arrayNode.isArray()) {
                for (JsonNode node : arrayNode) {
                    items.add(toIssue(node));
                    currentSize++;
                }
            }
            if (currentSize < PAGE_SIZE) {
                return items;
            }
            page++;
        }
    }

    private JsonNode sendJsonGet(String url) {
        HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofSeconds(20))
                .header("Accept", "application/json")
                .GET()
                .build();
        try {
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.statusCode() >= 400) {
                throw new IllegalStateException(resolveErrorMessage(response.body(), response.statusCode()));
            }
            return objectMapper.readTree(response.body());
        } catch (IOException exception) {
            throw new IllegalStateException("读取 Gitee 接口响应失败", exception);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("请求 Gitee 接口被中断", exception);
        }
    }

    private String resolveErrorMessage(String responseBody, int statusCode) {
        if (responseBody == null || responseBody.isBlank()) {
            return "请求 Gitee 接口失败，HTTP " + statusCode;
        }
        try {
            JsonNode node = objectMapper.readTree(responseBody);
            String message = firstText(
                    node.path("message"),
                    node.path("error"),
                    node.path("error_description"),
                    node.path("msg")
            );
            if (hasText(message)) {
                return message;
            }
        } catch (IOException ignored) {
            // 保留原始 body 兜底。
        }
        return responseBody.length() > 500 ? responseBody.substring(0, 500) : responseBody;
    }

    private GiteeProgram toProgram(JsonNode node) {
        return new GiteeProgram(
                node.path("id").asLong(),
                firstText(node.path("name"), node.path("title")),
                firstText(node.path("ident"), node.path("path"), node.path("identifier"))
        );
    }

    private GiteeMilestone toMilestone(JsonNode node) {
        return new GiteeMilestone(
                node.path("id").asLong(),
                firstText(node.path("title"), node.path("name")),
                firstText(node.path("state"), node.path("status")),
                normalizeDateText(firstText(node.path("start_date"), node.path("plan_started_at"))),
                normalizeDateText(firstText(node.path("due_date"), node.path("deadline"), node.path("end_date")))
        );
    }

    /**
     * Gitee issue 返回结构存在企业版本差异：
     * 有的版本把状态和类型包在 issue_state / issue_type 对象里，有的直接平铺到顶层。
     * 这里统一做多字段兜底，避免接口升级后同步链路脆断。
     */
    private GiteeIssue toIssue(JsonNode node) {
        return new GiteeIssue(
                node.path("id").asLong(),
                firstText(node.path("title"), node.path("subject")),
                firstText(node.path("description"), node.path("body")),
                firstText(
                        node.path("issue_type").path("title"),
                        node.path("issue_type").path("name"),
                        node.path("issue_type_name"),
                        node.path("category")
                ),
                firstText(
                        node.path("issue_state").path("title"),
                        node.path("issue_state").path("name"),
                        node.path("state"),
                        node.path("status")
                ),
                firstText(node.path("priority"), node.path("priority_name")),
                resolveUserDisplayName(node.path("assignee"), node.path("assigned_to"), node.path("user")),
                normalizeDateText(firstText(node.path("plan_started_at"), node.path("start_date"))),
                normalizeDateText(firstText(node.path("deadline"), node.path("due_date"), node.path("end_date"))),
                firstText(node.path("html_url"), node.path("web_url"), node.path("url"))
        );
    }

    private String resolveUserDisplayName(JsonNode... nodes) {
        for (JsonNode node : nodes) {
            if (node == null || node.isMissingNode() || node.isNull()) {
                continue;
            }
            String value = firstText(node.path("name"), node.path("nickname"), node.path("username"), node.path("login"));
            if (hasText(value)) {
                return value;
            }
        }
        return "";
    }

    private String normalizeDateText(String value) {
        if (!hasText(value)) {
            return null;
        }
        String normalized = value.trim();
        int timeSeparatorIndex = normalized.indexOf('T');
        if (timeSeparatorIndex > 0) {
            normalized = normalized.substring(0, timeSeparatorIndex);
        }
        int blankSeparatorIndex = normalized.indexOf(' ');
        if (blankSeparatorIndex > 0) {
            normalized = normalized.substring(0, blankSeparatorIndex);
        }
        return normalized;
    }

    private String buildUrl(String baseUrl, Map<String, String> params) {
        StringBuilder builder = new StringBuilder(baseUrl);
        boolean first = true;
        for (Map.Entry<String, String> entry : params.entrySet()) {
            if (!hasText(entry.getValue())) {
                continue;
            }
            builder.append(first ? '?' : '&');
            first = false;
            builder.append(urlEncode(entry.getKey()))
                    .append('=')
                    .append(urlEncode(entry.getValue()));
        }
        return builder.toString();
    }

    private String normalizeBaseUrl(String value) {
        String normalized = value == null ? "" : value.trim();
        while (normalized.endsWith("/")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        if (!hasText(normalized)) {
            throw new IllegalArgumentException("Gitee API 地址不能为空");
        }
        return normalized;
    }

    private String firstText(JsonNode... nodes) {
        for (JsonNode node : nodes) {
            if (node == null || node.isMissingNode() || node.isNull()) {
                continue;
            }
            String value = node.asText("");
            if (hasText(value)) {
                return value.trim();
            }
        }
        return "";
    }

    private String urlEncode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    public record GiteeProgram(Long id, String name, String ident) {
    }

    public record GiteeMilestone(Long id, String title, String state, String startDate, String endDate) {
    }

    public record GiteeIssue(Long id,
                             String title,
                             String description,
                             String workItemType,
                             String status,
                             String priority,
                             String assigneeName,
                             String planStartDate,
                             String planEndDate,
                             String webUrl) {
    }
}
