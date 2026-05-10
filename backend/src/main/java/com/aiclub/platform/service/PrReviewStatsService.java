package com.aiclub.platform.service;

import com.aiclub.platform.dto.PrReviewStatsConfigSummary;
import com.aiclub.platform.dto.PrReviewStatsGroupSummary;
import com.aiclub.platform.dto.PrReviewStatsPendingTaskGroupSummary;
import com.aiclub.platform.dto.PrReviewStatsPendingTaskSummary;
import com.aiclub.platform.dto.PrReviewStatsSummary;
import com.aiclub.platform.dto.request.PrReviewStatsQueryRequest;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * PR 评审统计服务。
 * 复用既有 Python 脚本的业务规则，改造成平台内可视化查询接口。
 */
@Service
public class PrReviewStatsService {

    private static final double REJECT_TARGET_RATE = 25D;

    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final PrReviewStatsProperties properties;
    private final PlatformEnvVarResolver platformEnvVarResolver;

    @Autowired
    public PrReviewStatsService(ObjectMapper objectMapper,
                                PrReviewStatsProperties properties,
                                PlatformEnvVarResolver platformEnvVarResolver) {
        this(
                objectMapper,
                properties,
                platformEnvVarResolver,
                HttpClient.newBuilder()
                        .connectTimeout(Duration.ofSeconds(10))
                        .followRedirects(HttpClient.Redirect.NORMAL)
                        .build()
        );
    }

    PrReviewStatsService(ObjectMapper objectMapper,
                         PrReviewStatsProperties properties,
                         PlatformEnvVarResolver platformEnvVarResolver,
                         HttpClient httpClient) {
        this.objectMapper = objectMapper;
        this.properties = properties;
        this.platformEnvVarResolver = platformEnvVarResolver;
        this.httpClient = httpClient;
    }

    /**
     * 返回页面初始化所需的默认值与默认开发组列表。
     */
    public PrReviewStatsConfigSummary getDefaultConfig(String startTime, String endTime) {
        List<PrReviewStatsGroupSummary> groups = List.of();
        OaCredential credential = tryResolveOaCredential();
        if (credential != null) {
            groups = listGroups(startTime, endTime, credential);
        }
        return new PrReviewStatsConfigSummary(
                properties.getOaBaseUrl(),
                properties.getDefaultDevGroupName(),
                groups
        );
    }

    /**
     * 读取 OA 可选开发组。
     */
    public List<PrReviewStatsGroupSummary> listGroups(String startTime, String endTime) {
        return listGroups(startTime, endTime, resolveOaCredential());
    }

    private List<PrReviewStatsGroupSummary> listGroups(String startTime, String endTime, OaCredential credential) {
        String normalizedStartTime = normalizeStartTime(startTime);
        String normalizedEndTime = normalizeEndTime(endTime);
        JsonNode root = sendJsonRequest(
                "POST",
                "/zz/oa/rs/group/1",
                Map.of(
                        "start_time", normalizedStartTime,
                        "end_time", normalizedEndTime
                ),
                credential
        );
        List<PrReviewStatsGroupSummary> groups = new ArrayList<>();
        JsonNode dataNode = root.path("data");
        if (dataNode.isArray()) {
            for (JsonNode item : dataNode) {
                groups.add(new PrReviewStatsGroupSummary(
                        item.path("id").asLong(),
                        decodeText(item.path("name").asText(""))
                ));
            }
        }
        return groups.stream()
                .sorted(Comparator.comparing(PrReviewStatsGroupSummary::name, String.CASE_INSENSITIVE_ORDER))
                .toList();
    }

    /**
     * 统计指定开发组的 PR 打回率与未合并任务。
     */
    public PrReviewStatsSummary queryStats(PrReviewStatsQueryRequest request) {
        String normalizedStartTime = normalizeStartTime(request.startTime());
        String normalizedEndTime = normalizeEndTime(request.endTime());
        OaCredential credential = resolveOaCredential();
        List<OaIssueItem> issues = queryIssues(normalizedStartTime, normalizedEndTime, request.groupId(), credential);
        List<OaIssueItem> developmentTasks = issues.stream()
                .filter(item -> "开发任务".equals(item.issueType()))
                .toList();
        List<OaIssueItem> unmergedDevelopmentTasks = developmentTasks.stream()
                .filter(item -> !isMergedOrClosed(item.prState()))
                .filter(item -> !shouldIgnoreByDevContent(item.devContent()))
                .toList();

        List<OaPrItem> prs = queryPrs(normalizedStartTime, normalizedEndTime, request.groupId(), credential);
        int closedPrCount = (int) prs.stream()
                .filter(item -> "closed".equalsIgnoreCase(item.state()))
                .count();
        int mergedOrClosedDevelopmentCount = (int) developmentTasks.stream()
                .filter(item -> isMergedOrClosed(item.prState()))
                .count();

        double rejectRate = prs.isEmpty() ? 0D : closedPrCount * 100D / prs.size();
        boolean rejectRateQualified = rejectRate >= REJECT_TARGET_RATE;
        boolean allMerged = unmergedDevelopmentTasks.isEmpty();

        List<PrReviewStatsPendingTaskGroupSummary> pendingTaskGroups = buildPendingTaskGroups(unmergedDevelopmentTasks);
        String issueBracketSuggestion = pendingTaskGroups.stream()
                .map(PrReviewStatsPendingTaskGroupSummary::issueBracketText)
                .filter(this::hasText)
                .collect(Collectors.joining(","));

        String groupName = resolveGroupName(request.groupId(), request.groupName(), normalizedStartTime, normalizedEndTime, credential);
        String summaryMarkdown = buildSummaryMarkdown(
                request.startTime(),
                request.endTime(),
                groupName,
                prs.size(),
                closedPrCount,
                rejectRate,
                rejectRateQualified,
                allMerged,
                pendingTaskGroups
        );

        return new PrReviewStatsSummary(
                request.startTime(),
                request.endTime(),
                request.groupId(),
                groupName,
                prs.size(),
                closedPrCount,
                mergedOrClosedDevelopmentCount,
                unmergedDevelopmentTasks.size(),
                roundPercent(rejectRate),
                REJECT_TARGET_RATE,
                rejectRateQualified,
                allMerged,
                issueBracketSuggestion,
                summaryMarkdown,
                pendingTaskGroups
        );
    }

    private List<PrReviewStatsPendingTaskGroupSummary> buildPendingTaskGroups(List<OaIssueItem> tasks) {
        Map<String, List<OaIssueItem>> grouped = new LinkedHashMap<>();
        for (OaIssueItem item : tasks) {
            String assignee = hasText(item.assigneeRemark()) ? item.assigneeRemark().trim() : "未知处理人";
            grouped.computeIfAbsent(assignee, key -> new ArrayList<>()).add(item);
        }
        return grouped.entrySet().stream()
                .map(entry -> {
                    List<PrReviewStatsPendingTaskSummary> rows = entry.getValue().stream()
                            .map(item -> new PrReviewStatsPendingTaskSummary(
                                    item.ident(),
                                    decodeText(item.title()),
                                    entry.getKey(),
                                    decodeText(item.projectName()),
                                    decodeText(item.prTitle()),
                                    defaultString(item.prState())
                            ))
                            .toList();
                    String bracketText = rows.stream()
                            .map(PrReviewStatsPendingTaskSummary::ident)
                            .filter(this::hasText)
                            .collect(Collectors.joining(","));
                    return new PrReviewStatsPendingTaskGroupSummary(
                            entry.getKey(),
                            rows.size(),
                            hasText(bracketText) ? "[[" + bracketText + "]]" : "",
                            rows
                    );
                })
                .sorted(Comparator.comparing(PrReviewStatsPendingTaskGroupSummary::assigneeRemark, String.CASE_INSENSITIVE_ORDER))
                .toList();
    }

    private List<OaPrItem> queryPrs(String startTime, String endTime, Long groupId, OaCredential credential) {
        JsonNode root = sendJsonRequest(
                "GET",
                "/zz/oa/rs/get_pr?start_time=" + urlEncode(startTime)
                        + "&end_time=" + urlEncode(endTime)
                        + "&dev_group_id=" + groupId,
                null,
                credential
        );
        List<OaPrItem> result = new ArrayList<>();
        JsonNode dataNode = root.path("data");
        if (dataNode.isArray()) {
            for (JsonNode item : dataNode) {
                result.add(new OaPrItem(
                        decodeText(item.path("state").asText("")),
                        decodeText(item.path("ident_str").asText("")),
                        decodeText(item.path("memo").asText("")),
                        decodeText(item.path("title").asText(""))
                ));
            }
        }
        return result;
    }

    private List<OaIssueItem> queryIssues(String startTime, String endTime, Long groupId, OaCredential credential) {
        JsonNode root = sendJsonRequest(
                "GET",
                "/zz/oa/rs/get_issue?dev_group_id=" + groupId
                        + "&issue_type=1"
                        + "&start_time=" + urlEncode(startTime)
                        + "&end_time=" + urlEncode(endTime),
                null,
                credential
        );
        List<OaIssueItem> result = new ArrayList<>();
        JsonNode dataNode = root.path("data");
        if (dataNode.isArray()) {
            for (JsonNode item : dataNode) {
                result.add(new OaIssueItem(
                        decodeText(item.path("ident").asText("")),
                        decodeText(item.path("title").asText("")),
                        decodeText(item.path("issue_type").asText("")),
                        decodeText(item.path("assignee_remark").asText("")),
                        decodeText(item.path("dev_content").asText("")),
                        decodeText(item.path("pr_state").asText("")),
                        decodeText(item.path("project_name").asText("")),
                        decodeText(item.path("pr_title").asText(""))
                ));
            }
        }
        return result;
    }

    private JsonNode sendJsonRequest(String method,
                                     String pathOrUrl,
                                     Object requestBody,
                                     OaCredential credential) {
        try {
            String url = pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")
                    ? pathOrUrl
                    : normalizeBaseUrl(properties.getOaBaseUrl()) + pathOrUrl;
            HttpRequest.Builder builder = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(Duration.ofSeconds(30))
                    .header("Qw-user-id", credential.userId())
                    .header("Qw-token", credential.token())
                    .header(HttpHeaders.ACCEPT, "application/json");

            if ("POST".equalsIgnoreCase(method)) {
                builder.header(HttpHeaders.CONTENT_TYPE, "application/json");
                String body = requestBody == null ? "{}" : objectMapper.writeValueAsString(requestBody);
                builder.POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8));
            } else {
                builder.GET();
            }

            HttpResponse<String> response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.statusCode() >= HttpStatus.BAD_REQUEST.value()) {
                throw new IllegalStateException("OA接口请求失败，状态码: " + response.statusCode());
            }
            String responseBody = response.body();
            JsonNode root = objectMapper.readTree(responseBody == null ? "{}" : responseBody);
            if (root.path("code").asInt(200) != 200) {
                throw new IllegalStateException("OA接口返回失败: " + decodeText(root.path("msg").asText("未知错误")));
            }
            return root;
        } catch (IOException | InterruptedException ex) {
            if (ex instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            throw new IllegalStateException("调用OA接口失败: " + ex.getMessage(), ex);
        }
    }

    private String resolveGroupName(Long groupId,
                                    String preferredName,
                                    String startTime,
                                    String endTime,
                                    OaCredential credential) {
        if (hasText(preferredName)) {
            return preferredName.trim();
        }
        return listGroups(startTime, endTime, credential).stream()
                .filter(item -> item.id().equals(groupId))
                .map(PrReviewStatsGroupSummary::name)
                .findFirst()
                .orElse(String.valueOf(groupId));
    }

    private String buildSummaryMarkdown(String startTime,
                                        String endTime,
                                        String groupName,
                                        int totalPrCount,
                                        int closedPrCount,
                                        double rejectRate,
                                        boolean rejectRateQualified,
                                        boolean allMerged,
                                        List<PrReviewStatsPendingTaskGroupSummary> pendingTaskGroups) {
        StringBuilder builder = new StringBuilder();
        builder.append("# 统计时间\n");
        builder.append(startTime).append(" - ").append(endTime).append("\n");
        builder.append("# 开发组\n");
        builder.append(groupName).append("\n");
        builder.append("# PR合并状态\n");
        if (allMerged) {
            builder.append("- 已全部完成合并\n");
        } else {
            for (PrReviewStatsPendingTaskGroupSummary group : pendingTaskGroups) {
                builder.append("- **")
                        .append(group.assigneeRemark())
                        .append("**还有**")
                        .append(group.count())
                        .append("**个开发任务没有合并PR！：")
                        .append(group.issueBracketText())
                        .append("\n");
            }
        }
        builder.append("# PR审查情况 \n");
        builder.append("- 所有PR数量:").append(totalPrCount).append("\n");
        builder.append("- 所有关闭的PR数量:").append(closedPrCount).append("\n");
        builder.append("- 打回率:").append(String.format(Locale.ROOT, "%.2f%%", rejectRate))
                .append("（")
                .append(rejectRateQualified ? "达标" : "未达标")
                .append("，目标25%）\n");
        return builder.toString();
    }

    private boolean isMergedOrClosed(String prState) {
        return "merged".equalsIgnoreCase(prState) || "closed".equalsIgnoreCase(prState);
    }

    private boolean shouldIgnoreByDevContent(String devContent) {
        if (!hasText(devContent)) {
            return false;
        }
        return devContent.contains("外部项目")
                || devContent.contains("智能体")
                || devContent.contains("已被删除");
    }

    private double roundPercent(double value) {
        return Math.round(value * 100D) / 100D;
    }

    private String normalizeBaseUrl(String baseUrl) {
        return baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
    }

    private String normalizeStartTime(String value) {
        return normalizeDateBoundary(value, true);
    }

    private String normalizeEndTime(String value) {
        return normalizeDateBoundary(value, false);
    }

    /**
     * 页面按天筛选时会传入 yyyy-MM-dd，这里统一补齐当天的起止时间；
     * 若调用方已经传入完整时间字符串，则保持原样，兼容已有调用方式。
     */
    private String normalizeDateBoundary(String value, boolean startOfDay) {
        String trimmed = defaultString(value).trim();
        if (!hasText(trimmed)) {
            return trimmed;
        }
        if (trimmed.length() > 10) {
            return trimmed;
        }
        try {
            LocalDate date = LocalDate.parse(trimmed);
            return date + (startOfDay ? " 00:00:00" : " 23:59:59");
        } catch (DateTimeParseException ex) {
            return trimmed;
        }
    }

    private String urlEncode(String value) {
        return URLEncoder.encode(defaultString(value), StandardCharsets.UTF_8);
    }

    /**
     * 某些 OA 接口响应虽然声明为 UTF-8，但正文实际呈现为被二次按 ISO-8859-1 读取的乱码。
     * 这里在中文乱码明显时做一次兜底解码，保证页面展示中文可读。
     */
    private String decodeText(String raw) {
        if (!hasText(raw)) {
            return defaultString(raw);
        }
        if (!containsLikelyMojibake(raw)) {
            return raw;
        }
        byte[] bytes = raw.getBytes(StandardCharsets.ISO_8859_1);
        return new String(bytes, StandardCharsets.UTF_8);
    }

    private boolean containsLikelyMojibake(String value) {
        return value.contains("Ã") || value.contains("æ") || value.contains("ä") || value.contains("ç") || value.contains("é");
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private String defaultString(String value) {
        return value == null ? "" : value;
    }

    private OaCredential resolveOaCredential() {
        return new OaCredential(
                platformEnvVarResolver.resolve(
                        PlatformEnvVarRegistry.KEY_PR_REVIEW_OA_USER_ID,
                        () -> null
                ).value(),
                platformEnvVarResolver.resolve(
                        PlatformEnvVarRegistry.KEY_PR_REVIEW_OA_TOKEN,
                        () -> null
                ).value()
        );
    }

    private OaCredential tryResolveOaCredential() {
        try {
            return resolveOaCredential();
        } catch (RuntimeException exception) {
            return null;
        }
    }

    /**
     * OA 接口认证信息由环境变量管理统一托管，页面只负责选择统计条件。
     */
    private record OaCredential(String userId, String token) {
    }

    private record OaPrItem(
            String state,
            String identStr,
            String memo,
            String title
    ) {
    }

    private record OaIssueItem(
            String ident,
            String title,
            String issueType,
            String assigneeRemark,
            String devContent,
            String prState,
            String projectName,
            String prTitle
    ) {
    }
}
