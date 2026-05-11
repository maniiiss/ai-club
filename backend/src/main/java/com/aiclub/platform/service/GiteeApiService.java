package com.aiclub.platform.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import org.springframework.beans.factory.annotation.Autowired;
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
    private static final int SPRINT_PAGE_SIZE = 20;
    private static final String PUBLIC_GITEE_HOST = "gitee.com";
    private static final String PUBLIC_GITEE_API_HOST = "api.gitee.com";
    private static final String ENTERPRISES_PATH = "/enterprises";

    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    @Autowired
    public GiteeApiService(ObjectMapper objectMapper) {
        this(
                objectMapper,
                HttpClient.newBuilder()
                        .connectTimeout(Duration.ofSeconds(10))
                        .build()
        );
    }

    GiteeApiService(ObjectMapper objectMapper, HttpClient httpClient) {
        this.objectMapper = objectMapper;
        this.httpClient = httpClient;
    }

    public List<GiteeProgram> listPrograms(String apiBaseUrl, String accessToken, Long enterpriseId) {
        List<GiteeProgram> items = new ArrayList<>();
        int page = 1;
        while (true) {
            JsonNode arrayNode = extractArrayNode(
                    sendJsonGet(buildUrl(
                            normalizeEnterpriseApiBaseUrl(apiBaseUrl) + "/" + enterpriseId + "/programs",
                            Map.of(
                                    "access_token", accessToken,
                                    "page", String.valueOf(page),
                                    "per_page", String.valueOf(PAGE_SIZE)
                            )
                    )),
                    "programs",
                    "data",
                    "items"
            );
            int currentSize = 0;
            for (JsonNode node : arrayNode) {
                items.add(toProgram(node));
                currentSize++;
            }
            if (currentSize < PAGE_SIZE) {
                return items;
            }
            page++;
        }
    }

    public List<GiteeMember> listMembers(String apiBaseUrl, String accessToken, Long enterpriseId, String search) {
        List<GiteeMember> items = new ArrayList<>();
        int page = 1;
        while (true) {
            Map<String, String> params = new java.util.LinkedHashMap<>();
            params.put("access_token", accessToken);
            params.put("page", String.valueOf(page));
            params.put("per_page", String.valueOf(PAGE_SIZE));
            if (hasText(search)) {
                params.put("search", search.trim());
            }
            JsonNode arrayNode = extractArrayNode(
                    sendJsonGet(buildUrl(
                            normalizeEnterpriseApiBaseUrl(apiBaseUrl) + "/" + enterpriseId + "/members",
                            params
                    )),
                    "members",
                    "data",
                    "items"
            );
            int currentSize = 0;
            for (JsonNode node : arrayNode) {
                items.add(toMember(node));
                currentSize++;
            }
            if (currentSize < PAGE_SIZE) {
                return items;
            }
            page++;
        }
    }

    public GiteeProgram fetchProgram(String apiBaseUrl, String accessToken, Long enterpriseId, Long programId) {
        JsonNode node = sendJsonGet(buildUrl(
                normalizeEnterpriseApiBaseUrl(apiBaseUrl) + "/" + enterpriseId + "/programs/" + programId,
                Map.of("access_token", accessToken)
        ));
        return toProgram(node);
    }

    /**
     * 平台内部历史上把远端迭代叫 milestone，但企业版当前实际应走 scrum_sprints。
     * 这里保留旧方法名，只是为了兼容现有 service / controller / 前端字段。
     */
    public List<GiteeMilestone> listMilestones(String apiBaseUrl, String accessToken, Long enterpriseId, Long programId) {
        List<GiteeMilestone> items = new ArrayList<>();
        int page = 1;
        while (true) {
            JsonNode arrayNode = extractArrayNode(
                    sendJsonGet(buildUrl(
                            normalizeEnterpriseApiBaseUrl(apiBaseUrl) + "/" + enterpriseId + "/programs/" + programId + "/scrum_sprints",
                            Map.of(
                                    "access_token", accessToken,
                                    "page", String.valueOf(page),
                                    "offset", String.valueOf((page - 1) * SPRINT_PAGE_SIZE),
                                    "per_page", String.valueOf(SPRINT_PAGE_SIZE)
                            )
                    )),
                    "scrum_sprints",
                    "milestones",
                    "data",
                    "items"
            );
            int currentSize = 0;
            for (JsonNode node : arrayNode) {
                items.add(toMilestone(node));
                currentSize++;
            }
            if (currentSize < SPRINT_PAGE_SIZE) {
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
        // 远端同步范围已经从 milestone_id 切到 scrum_sprint_ids，参数名保留旧值仅为了兼容调用方。
        List<GiteeIssue> items = new ArrayList<>();
        int page = 1;
        while (true) {
            JsonNode arrayNode = extractArrayNode(
                    sendJsonGet(buildUrl(
                            normalizeEnterpriseApiBaseUrl(apiBaseUrl) + "/" + enterpriseId + "/issues",
                            Map.of(
                                    "access_token", accessToken,
                                    "program_id", String.valueOf(programId),
                                    "scrum_sprint_ids", String.valueOf(milestoneId),
                                    "page", String.valueOf(page),
                                    "per_page", String.valueOf(PAGE_SIZE)
                            )
                    )),
                    "issues",
                    "data",
                    "items"
            );
            int currentSize = 0;
            for (JsonNode node : arrayNode) {
                items.add(toIssue(node));
                currentSize++;
            }
            if (currentSize < PAGE_SIZE) {
                return items;
            }
            page++;
        }
    }

    public GiteeIssue fetchIssueDetail(String apiBaseUrl, String accessToken, Long enterpriseId, Long issueId) {
        JsonNode node = sendJsonGet(buildUrl(
                normalizeEnterpriseApiBaseUrl(apiBaseUrl) + "/" + enterpriseId + "/issues/" + issueId,
                Map.of("access_token", accessToken)
        ));
        return toIssue(node.path("data").isObject() ? node.path("data") : node);
    }

    public GiteeRemoteTestPlan createTestPlan(String apiBaseUrl,
                                              String accessToken,
                                              Long enterpriseId,
                                              GiteeTestPlanRequest requestBody) {
        JsonNode node = sendJsonRequest(
                "POST",
                buildUrl(
                        normalizeEnterpriseApiBaseUrl(apiBaseUrl) + "/" + enterpriseId + "/test_plans",
                        Map.of("access_token", accessToken)
                ),
                requestBody
        );
        return toRemoteTestPlan(node);
    }

    public GiteeRemoteTestPlan updateTestPlan(String apiBaseUrl,
                                              String accessToken,
                                              Long enterpriseId,
                                              Long remoteTestPlanId,
                                              GiteeTestPlanRequest requestBody) {
        JsonNode node = sendJsonRequest(
                "PUT",
                buildUrl(
                        normalizeEnterpriseApiBaseUrl(apiBaseUrl) + "/" + enterpriseId + "/test_plans/" + remoteTestPlanId,
                        Map.of("access_token", accessToken)
                ),
                requestBody
        );
        return toRemoteTestPlan(node);
    }

    public GiteeRemoteTestCase createTestCase(String apiBaseUrl,
                                              String accessToken,
                                              Long enterpriseId,
                                              GiteeTestCaseRequest requestBody) {
        JsonNode node = sendJsonRequest(
                "POST",
                buildUrl(
                        normalizeEnterpriseApiBaseUrl(apiBaseUrl) + "/" + enterpriseId + "/test_cases",
                        Map.of("access_token", accessToken)
                ),
                requestBody
        );
        return toRemoteTestCase(node);
    }

    public GiteeRemoteTestCase updateTestCase(String apiBaseUrl,
                                              String accessToken,
                                              Long enterpriseId,
                                              Long remoteTestCaseId,
                                              GiteeTestCaseRequest requestBody) {
        JsonNode node = sendJsonRequest(
                "PUT",
                buildUrl(
                        normalizeEnterpriseApiBaseUrl(apiBaseUrl) + "/" + enterpriseId + "/test_cases/" + remoteTestCaseId,
                        Map.of("access_token", accessToken)
                ),
                requestBody
        );
        return toRemoteTestCase(node);
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

    private JsonNode sendJsonRequest(String method, String url, Object requestBody) {
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofSeconds(20))
                    .header("Accept", "application/json")
                    .header("Content-Type", "application/json; charset=UTF-8")
                    .method(method, HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(requestBody), StandardCharsets.UTF_8))
                    .build();
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

    /**
     * 企业成员接口会同时返回成员记录和嵌套 user 对象，这里优先保留成员侧备注名。
     */
    private GiteeMember toMember(JsonNode node) {
        JsonNode userNode = node.path("user");
        return new GiteeMember(
                node.path("id").asLong(),
                firstText(node.path("username"), userNode.path("username"), userNode.path("login")),
                firstText(node.path("remark"), node.path("name"), userNode.path("name"), userNode.path("nickname"), userNode.path("username")),
                firstText(node.path("email"), userNode.path("email")),
                firstText(node.path("avatar_url"), node.path("avatarUrl"), userNode.path("avatar_url"), userNode.path("avatarUrl"))
        );
    }

    /**
     * Gitee 企业项目相关接口的入口和 Swagger 文档地址经常被用户混填。
     * 这里把公开云版常见地址统一折算到 `/enterprises` 前缀，避免列表请求命中错误路径。
     */
    public String normalizeEnterpriseApiBaseUrl(String value) {
        String normalized = value == null ? "" : value.trim();
        if (!hasText(normalized)) {
            throw new IllegalArgumentException("Gitee API 地址不能为空");
        }
        if (!normalized.contains("://")) {
            normalized = "https://" + normalized;
        }
        URI uri;
        try {
            uri = URI.create(normalized);
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException("Gitee API 地址格式不正确", exception);
        }
        String scheme = hasText(uri.getScheme()) ? uri.getScheme() : "https";
        String authority = uri.getRawAuthority();
        String host = uri.getHost();
        if (!hasText(authority) || !hasText(host)) {
            throw new IllegalArgumentException("Gitee API 地址格式不正确");
        }
        String path = trimTrailingSlash(uri.getPath());
        if (PUBLIC_GITEE_API_HOST.equalsIgnoreCase(host)) {
            return buildNormalizedBaseUrl(scheme, authority, ENTERPRISES_PATH);
        }
        if (PUBLIC_GITEE_HOST.equalsIgnoreCase(host)
                && ("/api/v8".equals(path) || path.startsWith("/api/v8/swagger"))) {
            return buildNormalizedBaseUrl("https", PUBLIC_GITEE_API_HOST, ENTERPRISES_PATH);
        }
        return buildNormalizedBaseUrl(scheme, authority, path);
    }

    private GiteeMilestone toMilestone(JsonNode node) {
        return new GiteeMilestone(
                node.path("id").asLong(),
                firstText(node.path("title"), node.path("name")),
                firstText(
                        node.path("state"),
                        node.path("status"),
                        node.path("sprint_state"),
                        node.path("scrum_status")
                ),
                normalizeDateText(firstText(node.path("start_date"), node.path("plan_started_at"), node.path("started_at"), node.path("start_at"))),
                normalizeDateText(firstText(node.path("due_date"), node.path("deadline"), node.path("end_date"), node.path("ended_at"), node.path("finish_date")))
        );
    }

    /**
     * Gitee issue 返回结构存在企业版本差异：
     * 有的版本把状态和类型包在 issue_state / issue_type 对象里，有的直接平铺到顶层。
     * 这里统一做多字段兜底，避免接口升级后同步链路脆断。
     */
    private GiteeIssue toIssue(JsonNode node) {
        JsonNode assigneeNode = firstPresentNode(
                node.path("assignee"),
                node.path("assigned_to"),
                node.path("assignee_user"),
                node.path("assigned_user")
        );
        JsonNode creatorNode = firstPresentNode(
                node.path("author"),
                node.path("creator"),
                node.path("created_by"),
                node.path("user")
        );
        return new GiteeIssue(
                node.path("id").asLong(),
                firstText(node.path("title"), node.path("subject")),
                firstText(
                        node.path("description"),
                        node.path("body"),
                        node.path("content"),
                        node.path("issue_content"),
                        node.path("template_content"),
                        node.path("markdown"),
                        node.path("text_content")
                ),
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
                firstText(node.path("priority_human"), node.path("priority_name"), node.path("priority")),
                resolveUserDisplayName(assigneeNode),
                resolveUserMemberId(assigneeNode),
                resolveUserUsername(assigneeNode),
                resolveUserMemberId(creatorNode),
                resolveUserUsername(creatorNode),
                resolveUserDisplayName(creatorNode),
                normalizeDateText(firstText(node.path("plan_started_at"), node.path("start_date"))),
                normalizeDateText(firstText(node.path("deadline"), node.path("due_date"), node.path("end_date"))),
                firstText(node.path("html_url"), node.path("web_url"), node.path("url"))
        );
    }

    private GiteeRemoteTestPlan toRemoteTestPlan(JsonNode rootNode) {
        JsonNode node = extractObjectNode(rootNode, "test_plan");
        return new GiteeRemoteTestPlan(
                requiredLong(node, "id", "test_plan_id"),
                firstText(node.path("title"), node.path("name"))
        );
    }

    private GiteeRemoteTestCase toRemoteTestCase(JsonNode rootNode) {
        JsonNode node = extractObjectNode(rootNode, "test_case");
        return new GiteeRemoteTestCase(
                requiredLong(node, "id", "test_case_id"),
                firstText(node.path("title"), node.path("name"))
        );
    }

    private String resolveUserDisplayName(JsonNode... nodes) {
        for (JsonNode node : nodes) {
            if (node == null || node.isMissingNode() || node.isNull()) {
                continue;
            }
            if (node.isTextual()) {
                String textValue = node.asText("");
                if (hasText(textValue)) {
                    return textValue.trim();
                }
            }
            String value = firstText(
                    node.path("remark"),
                    node.path("name"),
                    node.path("nickname"),
                    node.path("username"),
                    node.path("login"),
                    node.path("user").path("remark"),
                    node.path("user").path("name"),
                    node.path("user").path("nickname"),
                    node.path("user").path("username"),
                    node.path("user").path("login")
            );
            if (hasText(value)) {
                return value;
            }
        }
        return "";
    }

    private Long resolveUserMemberId(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return null;
        }
        return firstLong(
                node.path("id"),
                node.path("member_id"),
                node.path("memberId"),
                node.path("enterprise_member_id"),
                node.path("enterpriseMemberId")
        );
    }

    private String resolveUserUsername(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return "";
        }
        if (node.isTextual()) {
            String textValue = node.asText("");
            return hasText(textValue) ? textValue.trim() : "";
        }
        return firstText(
                node.path("username"),
                node.path("login"),
                node.path("ident"),
                node.path("user").path("username"),
                node.path("user").path("login"),
                node.path("user").path("ident")
        );
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

    /**
     * Gitee 企业列表接口在不同版本下既可能直接返回数组，也可能包在 `programs` / `milestones` / `issues` 字段里。
     * 统一在这里拆包，避免前端拿到 200 响应后因为根节点不是数组而误判成“空列表”。
     */
    private JsonNode extractArrayNode(JsonNode rootNode, String... candidateFields) {
        if (rootNode.isArray()) {
            return rootNode;
        }
        for (String candidateField : candidateFields) {
            JsonNode resolvedNode = resolveArrayLikeNode(rootNode.path(candidateField));
            if (resolvedNode != null) {
                return resolvedNode;
            }
        }
        JsonNode groupedNode = resolveArrayLikeNode(rootNode);
        if (groupedNode != null) {
            return groupedNode;
        }
        throw new IllegalStateException("Gitee 接口返回格式不符合预期，未找到列表字段");
    }

    /**
     * 部分企业版里程碑接口会按状态把结果拆成多个数组字段返回，例如 `active` / `closed`。
     * 这里把这类“对象下挂多个数组”的返回统一拍平成一个数组，避免下拉框列表被误判为空。
     */
    private JsonNode resolveArrayLikeNode(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return null;
        }
        if (node.isArray()) {
            return node;
        }
        if (!node.isObject()) {
            return null;
        }
        ArrayNode merged = objectMapper.createArrayNode();
        boolean hasArrayChild = false;
        var fields = node.fields();
        while (fields.hasNext()) {
            Map.Entry<String, JsonNode> entry = fields.next();
            JsonNode value = entry.getValue();
            if (!value.isArray()) {
                continue;
            }
            hasArrayChild = true;
            value.forEach(merged::add);
        }
        return hasArrayChild ? merged : null;
    }

    private JsonNode extractObjectNode(JsonNode rootNode, String... candidateFields) {
        if (rootNode == null || rootNode.isMissingNode() || rootNode.isNull()) {
            throw new IllegalStateException("Gitee 接口返回为空");
        }
        if (rootNode.path("data").isObject()) {
            JsonNode dataNode = rootNode.path("data");
            for (String candidateField : candidateFields) {
                if (dataNode.path(candidateField).isObject()) {
                    return dataNode.path(candidateField);
                }
            }
            return dataNode;
        }
        for (String candidateField : candidateFields) {
            if (rootNode.path(candidateField).isObject()) {
                return rootNode.path(candidateField);
            }
        }
        if (rootNode.isObject()) {
            return rootNode;
        }
        throw new IllegalStateException("Gitee 接口返回格式不符合预期，未找到对象字段");
    }

    private JsonNode firstPresentNode(JsonNode... nodes) {
        for (JsonNode node : nodes) {
            if (node != null && !node.isMissingNode() && !node.isNull()) {
                return node;
            }
        }
        return objectMapper.missingNode();
    }

    private Long requiredLong(JsonNode node, String... candidateFields) {
        for (String candidateField : candidateFields) {
            JsonNode valueNode = node.path(candidateField);
            if (valueNode.isMissingNode() || valueNode.isNull()) {
                continue;
            }
            long value = valueNode.asLong(Long.MIN_VALUE);
            if (value != Long.MIN_VALUE) {
                return value;
            }
            String textValue = valueNode.asText("");
            if (hasText(textValue)) {
                try {
                    return Long.parseLong(textValue.trim());
                } catch (NumberFormatException ignored) {
                    // 继续尝试其它字段。
                }
            }
        }
        throw new IllegalStateException("Gitee 接口返回格式不符合预期，缺少远端ID");
    }

    private String buildNormalizedBaseUrl(String scheme, String authority, String path) {
        String normalizedPath = hasText(path) ? trimTrailingSlash(path) : "";
        return scheme + "://" + authority + normalizedPath;
    }

    private String trimTrailingSlash(String value) {
        String normalized = value == null ? "" : value.trim();
        while (normalized.endsWith("/")) {
            normalized = normalized.substring(0, normalized.length() - 1);
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

    private Long firstLong(JsonNode... nodes) {
        for (JsonNode node : nodes) {
            if (node == null || node.isMissingNode() || node.isNull()) {
                continue;
            }
            if (node.isIntegralNumber()) {
                return node.asLong();
            }
            String value = node.asText("");
            if (hasText(value)) {
                try {
                    return Long.parseLong(value.trim());
                } catch (NumberFormatException ignored) {
                    // 继续尝试其它字段。
                }
            }
        }
        return null;
    }

    private String urlEncode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    public record GiteeProgram(Long id, String name, String ident) {
    }

    public record GiteeMember(Long id, String username, String name, String email, String avatarUrl) {
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
                             Long assigneeMemberId,
                             String assigneeUsername,
                             Long creatorMemberId,
                             String creatorUsername,
                             String creatorName,
                             String planStartDate,
                             String planEndDate,
                             String webUrl) {

        public GiteeIssue(Long id,
                          String title,
                          String description,
                          String workItemType,
                          String status,
                          String priority,
                          String assigneeName,
                          String planStartDate,
                          String planEndDate,
                          String webUrl) {
            this(
                    id,
                    title,
                    description,
                    workItemType,
                    status,
                    priority,
                    assigneeName,
                    null,
                    "",
                    null,
                    "",
                    "",
                    planStartDate,
                    planEndDate,
                    webUrl
            );
        }
    }

    public record GiteeTestPlanRequest(String title,
                                       String ref_type,
                                       Long program_id,
                                       Long assignee_id,
                                       String description,
                                       String start_date,
                                       String end_date) {
    }

    public record GiteeTestCaseStepRequest(int id,
                                           int sort,
                                           String description,
                                           String expected_result) {
    }

    public record GiteeTestCaseRequest(Long module_id,
                                       Integer case_type,
                                       String title,
                                       String precondition,
                                       List<GiteeTestCaseStepRequest> case_steps,
                                       String remark,
                                       List<Long> attach_file_ids,
                                       Integer priority,
                                       Long program_id) {
    }

    public record GiteeRemoteTestPlan(Long id, String title) {
    }

    public record GiteeRemoteTestCase(Long id, String title) {
    }
}
