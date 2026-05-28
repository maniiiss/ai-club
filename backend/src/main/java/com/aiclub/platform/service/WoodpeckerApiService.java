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
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
public class WoodpeckerApiService {

    private final ObjectMapper objectMapper;
    private final WoodpeckerPipelineProperties properties;
    private final HttpClient httpClient;

    public WoodpeckerApiService(ObjectMapper objectMapper, WoodpeckerPipelineProperties properties) {
        this.objectMapper = objectMapper;
        this.properties = properties;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(properties.getTimeoutSeconds()))
                .build();
    }

    public WoodpeckerUser fetchCurrentUser() {
        JsonNode node = readJson(sendRequest("GET", "/user", null).body());
        return new WoodpeckerUser(
                readLong(node, "id"),
                firstText(node, "login", "username", "name"),
                firstText(node, "name", "full_name", "email")
        );
    }

    public Optional<WoodpeckerRepository> lookupRepository(String repoFullName) {
        try {
            JsonNode node = readJson(sendRequest("GET", "/repos/lookup/" + encodePath(repoFullName), null).body());
            if (node == null || node.isMissingNode() || node.isNull() || !node.hasNonNull("id")) {
                return Optional.empty();
            }
            return Optional.of(toRepository(node));
        } catch (IllegalStateException exception) {
            String message = exception.getMessage();
            if (message != null && (message.contains("HTTP 状态码: 404") || message.contains("not found") || message.contains("Not Found"))) {
                return Optional.empty();
            }
            throw exception;
        }
    }

    public WoodpeckerRepository activateRepository(String forgeRemoteId) {
        if (!hasText(forgeRemoteId)) {
            throw new IllegalArgumentException("GitLab 项目 ID 为空，无法激活 Woodpecker 仓库");
        }
        JsonNode node = readJson(sendRequest("POST", "/repos?forge_remote_id=" + urlEncode(forgeRemoteId.trim()), null).body());
        return toRepository(node);
    }

    public List<WoodpeckerPipeline> listPipelines(Long repoId, int limit) {
        int safeLimit = Math.max(1, Math.min(limit, 100));
        JsonNode node = readJson(sendRequest("GET", "/repos/" + repoId + "/pipelines?perPage=" + safeLimit, null).body());
        JsonNode arrayNode = node.isArray() ? node : node.path("pipelines");
        List<WoodpeckerPipeline> pipelines = new ArrayList<>();
        if (arrayNode.isArray()) {
            for (JsonNode item : arrayNode) {
                pipelines.add(toPipeline(item));
                if (pipelines.size() >= safeLimit) {
                    break;
                }
            }
        }
        return pipelines;
    }

    /**
     * 读取指定仓库下的全部 cron 定义。
     */
    public List<WoodpeckerCron> listCrons(Long repoId) {
        JsonNode node = readJson(sendRequest("GET", "/repos/" + requireRepoId(repoId) + "/cron", null).body());
        JsonNode arrayNode = node.isArray() ? node : node.path("cron");
        List<WoodpeckerCron> crons = new ArrayList<>();
        if (arrayNode.isArray()) {
            for (JsonNode item : arrayNode) {
                crons.add(toCron(item));
            }
        }
        return List.copyOf(crons);
    }

    /**
     * 创建仓库级 cron。
     */
    public WoodpeckerCron createCron(Long repoId, String name, String cronExpression, String branch) {
        JsonNode node = readJson(sendRequest(
                "POST",
                "/repos/" + requireRepoId(repoId) + "/cron",
                buildCronPayload(name, cronExpression, branch)
        ).body());
        return toCron(node);
    }

    /**
     * 更新仓库级 cron。
     */
    public WoodpeckerCron updateCron(Long repoId, Long cronId, String name, String cronExpression, String branch) {
        JsonNode node = readJson(sendRequest(
                "PATCH",
                "/repos/" + requireRepoId(repoId) + "/cron/" + requireCronId(cronId),
                buildCronPayload(name, cronExpression, branch)
        ).body());
        return toCron(node);
    }

    /**
     * 删除仓库级 cron。
     */
    public void deleteCron(Long repoId, Long cronId) {
        sendRequest("DELETE", "/repos/" + requireRepoId(repoId) + "/cron/" + requireCronId(cronId), null);
    }

    public WoodpeckerPipeline triggerPipeline(Long repoId, String branch, Map<String, String> variables) {
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            if (hasText(branch)) {
                payload.put("branch", branch.trim());
            }
            payload.put("variables", variables == null ? Map.of() : variables);
            String body = objectMapper.writeValueAsString(payload);
            JsonNode node = readJson(sendRequest("POST", "/repos/" + repoId + "/pipelines", body).body());
            return toPipeline(node);
        } catch (IOException exception) {
            throw new IllegalStateException("构造 Woodpecker 触发请求失败", exception);
        }
    }

    public WoodpeckerPipeline fetchPipeline(Long repoId, int pipelineNumber) {
        JsonNode node = readJson(sendRequest("GET", "/repos/" + repoId + "/pipelines/" + pipelineNumber, null).body());
        return toPipeline(node);
    }

    public String fetchStepLog(Long repoId, int pipelineNumber, long stepId) {
        HttpResponse<String> response = sendRequest("GET", "/repos/" + repoId + "/logs/" + pipelineNumber + "/" + stepId, null);
        String body = response.body();
        JsonNode node = readJson(body);
        String rawLog;
        if (!node.isArray()) {
            rawLog = body == null ? "" : body;
        } else {
            StringBuilder builder = new StringBuilder();
            for (JsonNode item : node) {
                builder.append(decodeLogData(item.path("data")));
                if (builder.length() == 0 || builder.charAt(builder.length() - 1) != '\n') {
                    builder.append('\n');
                }
            }
            rawLog = builder.toString();
        }
        return sanitizeShellTraceLog(rawLog);
    }

    /**
     * Woodpecker 的日志 API 在不同版本里可能返回纯文本，也可能返回字节数组。
     * 对数组直接调用 asText() 会被 Jackson 转成 Base64，因此这里显式按 UTF-8 解码。
     */
    private String decodeLogData(JsonNode dataNode) {
        if (dataNode == null || dataNode.isNull() || dataNode.isMissingNode()) {
            return "";
        }
        if (dataNode.isTextual()) {
            return dataNode.asText("");
        }
        if (dataNode.isBinary()) {
            try {
                return new String(dataNode.binaryValue(), StandardCharsets.UTF_8);
            } catch (IOException exception) {
                throw new IllegalStateException("解析 Woodpecker 日志失败", exception);
            }
        }
        if (dataNode.isArray()) {
            byte[] bytes = new byte[dataNode.size()];
            for (int index = 0; index < dataNode.size(); index++) {
                bytes[index] = (byte) dataNode.path(index).asInt();
            }
            return new String(bytes, StandardCharsets.UTF_8);
        }
        return dataNode.asText("");
    }

    public String fetchAggregatedLogs(Long repoId, int pipelineNumber) {
        WoodpeckerPipeline pipeline = fetchPipeline(repoId, pipelineNumber);
        StringBuilder builder = new StringBuilder();
        for (WoodpeckerStep step : pipeline.steps()) {
            builder.append("===== ").append(step.name()).append(" #").append(step.id()).append(" =====\n");
            try {
                builder.append(fetchStepLog(repoId, pipelineNumber, step.id()));
            } catch (RuntimeException exception) {
                builder.append("读取步骤日志失败：").append(exception.getMessage()).append('\n');
            }
            builder.append('\n');
        }
        return builder.toString();
    }

    public Optional<WoodpeckerSecret> fetchRepositorySecret(Long repoId, String secretName) {
        try {
            JsonNode node = readJson(sendRequest("GET", "/repos/" + requireRepoId(repoId) + "/secrets/" + urlEncode(normalizeSecretName(secretName)), null).body());
            if (node == null || node.isMissingNode() || node.isNull() || !hasText(firstText(node, "name"))) {
                return Optional.empty();
            }
            return Optional.of(toSecret(node));
        } catch (IllegalStateException exception) {
            if (isNotFound(exception)) {
                return Optional.empty();
            }
            throw exception;
        }
    }

    public WoodpeckerSecret createRepositorySecret(Long repoId,
                                                   String secretName,
                                                   String value,
                                                   String note,
                                                   List<String> events,
                                                   List<String> images) {
        JsonNode node = readJson(sendRequest(
                "POST",
                "/repos/" + requireRepoId(repoId) + "/secrets",
                buildSecretPayload(secretName, value, note, events, images)
        ).body());
        return toSecret(node);
    }

    public WoodpeckerSecret updateRepositorySecret(Long repoId,
                                                   String secretName,
                                                   String value,
                                                   String note,
                                                   List<String> events,
                                                   List<String> images) {
        String normalizedSecretName = normalizeSecretName(secretName);
        JsonNode node = readJson(sendRequest(
                "PATCH",
                "/repos/" + requireRepoId(repoId) + "/secrets/" + urlEncode(normalizedSecretName),
                buildSecretPayload(normalizedSecretName, value, note, events, images)
        ).body());
        return toSecret(node);
    }

    /**
     * Woodpecker repo secret 没有单独的原子 upsert API，这里先按名称查询，再按结果创建或更新。
     */
    public WoodpeckerSecret upsertRepositorySecret(Long repoId,
                                                   String secretName,
                                                   String value,
                                                   String note,
                                                   List<String> events,
                                                   List<String> images) {
        String normalizedSecretName = normalizeSecretName(secretName);
        return fetchRepositorySecret(repoId, normalizedSecretName)
                .map(existing -> updateRepositorySecret(repoId, normalizedSecretName, value, note, events, images))
                .orElseGet(() -> createRepositorySecret(repoId, normalizedSecretName, value, note, events, images));
    }

    private HttpResponse<String> sendRequest(String method, String path, String body) {
        try {
            HttpRequest.Builder builder = HttpRequest.newBuilder()
                    .uri(URI.create(properties.apiBaseUrl() + path))
                    .timeout(Duration.ofSeconds(properties.getTimeoutSeconds()))
                    .header("Authorization", "Bearer " + properties.getApiToken())
                    .header("Accept", "application/json");

            if (body == null) {
                builder.method(method, HttpRequest.BodyPublishers.noBody());
            } else {
                builder.header("Content-Type", "application/json");
                builder.method(method, HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8));
            }

            HttpResponse<String> response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.statusCode() >= 200 && response.statusCode() < 300) {
                return response;
            }
            throw new IllegalStateException(extractError(response));
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("调用 Woodpecker API 失败", exception);
        } catch (IOException exception) {
            throw new IllegalStateException("调用 Woodpecker API 失败", exception);
        }
    }

    private WoodpeckerRepository toRepository(JsonNode node) {
        return new WoodpeckerRepository(
                readLong(node, "id"),
                firstText(node, "forge_remote_id"),
                firstText(node, "owner"),
                firstText(node, "name"),
                firstText(node, "full_name", "fullName"),
                firstText(node, "forge_url", "link", "html_url"),
                firstText(node, "clone_url"),
                firstText(node, "default_branch"),
                firstText(node, "config_file", "config_path"),
                node.path("active").asBoolean(false)
        );
    }

    private String buildCronPayload(String name, String cronExpression, String branch) {
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("name", name == null ? "" : name.trim());
            payload.put("cron", cronExpression == null ? "" : cronExpression.trim());
            if (hasText(branch)) {
                payload.put("branch", branch.trim());
            }
            return objectMapper.writeValueAsString(payload);
        } catch (IOException exception) {
            throw new IllegalStateException("构造 Woodpecker cron 请求失败", exception);
        }
    }

    private String buildSecretPayload(String secretName,
                                      String value,
                                      String note,
                                      List<String> events,
                                      List<String> images) {
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("name", normalizeSecretName(secretName));
            payload.put("value", value == null ? "" : value);
            payload.put("note", note == null ? "" : note);
            payload.put("events", events == null ? List.of() : events.stream().filter(this::hasText).map(String::trim).toList());
            payload.put("images", images == null ? List.of() : images.stream().filter(this::hasText).map(String::trim).toList());
            return objectMapper.writeValueAsString(payload);
        } catch (IOException exception) {
            throw new IllegalStateException("构造 Woodpecker secret 请求失败", exception);
        }
    }

    /**
     * Woodpecker 原始步骤日志会把 shell trace 与 heredoc 脚本正文一起打出来，
     * 对“聚合日志”展示来说噪音很大。这里尽量只保留命令真实输出：
     * 1. 过滤 `+ command` 形式的 shell xtrace
     * 2. 过滤 heredoc 回显的脚本正文
     * 3. 保留远端命令真正写到 stdout/stderr 的内容，例如 ssh-keyscan 与远端脚本输出
     */
    private String sanitizeShellTraceLog(String rawLog) {
        if (!hasText(rawLog)) {
            return "";
        }
        String heredocTerminator = null;
        StringBuilder builder = new StringBuilder();
        String normalized = rawLog.replace("\r\n", "\n").replace('\r', '\n');
        for (String line : normalized.split("\n", -1)) {
            if (heredocTerminator != null) {
                if (line.trim().equals(heredocTerminator)) {
                    heredocTerminator = null;
                }
                continue;
            }
            String trimmed = line.trim();
            if (trimmed.startsWith("+")) {
                heredocTerminator = extractHeredocTerminator(trimmed);
                continue;
            }
            if (builder.length() > 0) {
                builder.append('\n');
            }
            builder.append(line);
        }
        return builder.toString().strip();
    }

    private String extractHeredocTerminator(String shellTraceLine) {
        int markerIndex = shellTraceLine.indexOf("<<'");
        if (markerIndex < 0) {
            return null;
        }
        int startIndex = markerIndex + 3;
        int endIndex = shellTraceLine.indexOf('\'', startIndex);
        if (endIndex <= startIndex) {
            return null;
        }
        String terminator = shellTraceLine.substring(startIndex, endIndex).trim();
        return hasText(terminator) ? terminator : null;
    }

    private WoodpeckerSecret toSecret(JsonNode node) {
        return new WoodpeckerSecret(
                readLong(node, "id"),
                readLong(node, "repo_id"),
                firstText(node, "name"),
                firstText(node, "note"),
                firstText(node, "value"),
                readTextList(node.path("events")),
                readTextList(node.path("images"))
        );
    }

    private WoodpeckerCron toCron(JsonNode node) {
        return new WoodpeckerCron(
                readLong(node, "id"),
                firstText(node, "name"),
                firstText(node, "cron", "expression"),
                firstText(node, "branch"),
                readBoolean(node, "enabled", "active", "is_active"),
                toLocalDateTime(firstLong(node, "next_exec", "next", "next_run"))
        );
    }

    private List<String> readTextList(JsonNode node) {
        if (node == null || !node.isArray()) {
            return List.of();
        }
        List<String> result = new ArrayList<>();
        for (JsonNode item : node) {
            String value = item.asText("");
            if (hasText(value)) {
                result.add(value.trim());
            }
        }
        return List.copyOf(result);
    }

    private WoodpeckerPipeline toPipeline(JsonNode node) {
        List<WoodpeckerStep> steps = new ArrayList<>();
        JsonNode workflowsNode = node.path("workflows");
        if (workflowsNode.isArray()) {
            for (JsonNode workflowNode : workflowsNode) {
                appendSteps(steps, workflowNode.path("children"));
            }
        }
        appendSteps(steps, node.path("children"));

        return new WoodpeckerPipeline(
                readLong(node, "id"),
                node.path("number").isNumber() ? node.path("number").asInt() : null,
                firstText(node, "status", "state"),
                firstText(node, "branch"),
                firstText(node, "event"),
                firstText(node, "message", "title"),
                firstText(node, "commit", "commit_sha", "sha"),
                firstText(node, "forge_url", "link", "url"),
                toLocalDateTime(firstLong(node, "created", "created_at")),
                toLocalDateTime(firstLong(node, "started", "started_at")),
                toLocalDateTime(firstLong(node, "finished", "finished_at")),
                List.copyOf(steps)
        );
    }

    private void appendSteps(List<WoodpeckerStep> target, JsonNode node) {
        if (target == null || node == null || !node.isArray()) {
            return;
        }
        for (JsonNode item : node) {
            long id = readLong(item, "id");
            if (id > 0L) {
                target.add(new WoodpeckerStep(
                        id,
                        firstText(item, "name", "title"),
                        firstText(item, "state", "status"),
                        item.path("exit_code").isNumber() ? item.path("exit_code").asInt() : null
                ));
            }
            appendSteps(target, item.path("children"));
        }
    }

    private JsonNode readJson(String body) {
        try {
            if (!hasText(body)) {
                return objectMapper.createObjectNode();
            }
            return objectMapper.readTree(body);
        } catch (Exception exception) {
            throw new IllegalStateException("解析 Woodpecker 返回数据失败", exception);
        }
    }

    private String extractError(HttpResponse<String> response) {
        String body = response.body() == null ? "" : response.body().trim();
        try {
            JsonNode node = objectMapper.readTree(body);
            String message = firstText(node, "message", "error");
            if (hasText(message)) {
                return "Woodpecker API 错误: " + message;
            }
        } catch (Exception ignored) {
        }
        if (hasText(body)) {
            return "Woodpecker API 错误，HTTP 状态码: " + response.statusCode() + "，响应: " + abbreviate(body, 300);
        }
        return "Woodpecker API 错误，HTTP 状态码: " + response.statusCode();
    }

    private LocalDateTime toLocalDateTime(long epochValue) {
        if (epochValue <= 0L) {
            return null;
        }
        long millis = epochValue > 9_999_999_999L ? epochValue : epochValue * 1000L;
        return LocalDateTime.ofInstant(Instant.ofEpochMilli(millis), ZoneId.systemDefault());
    }

    private long firstLong(JsonNode node, String... fieldNames) {
        for (String fieldName : fieldNames) {
            JsonNode value = node.path(fieldName);
            if (value.isNumber()) {
                return value.asLong();
            }
        }
        return 0L;
    }

    private long readLong(JsonNode node, String fieldName) {
        JsonNode value = node.path(fieldName);
        if (value.isNumber()) {
            return value.asLong();
        }
        if (value.isTextual() && hasText(value.asText())) {
            try {
                return Long.parseLong(value.asText().trim());
            } catch (NumberFormatException ignored) {
            }
        }
        return 0L;
    }

    private boolean readBoolean(JsonNode node, String... fieldNames) {
        for (String fieldName : fieldNames) {
            JsonNode value = node.path(fieldName);
            if (value.isBoolean()) {
                return value.asBoolean();
            }
            if (value.isTextual() && hasText(value.asText())) {
                return Boolean.parseBoolean(value.asText().trim());
            }
            if (value.isNumber()) {
                return value.asInt() != 0;
            }
        }
        return false;
    }

    private String firstText(JsonNode node, String... fieldNames) {
        for (String fieldName : fieldNames) {
            JsonNode value = node.path(fieldName);
            if (!value.isMissingNode() && !value.isNull()) {
                String text = value.asText("");
                if (hasText(text)) {
                    return text.trim();
                }
            }
        }
        return null;
    }

    private String encodePath(String value) {
        String normalized = value == null ? "" : value.trim();
        String[] parts = normalized.split("/");
        List<String> encodedParts = new ArrayList<>();
        for (String part : parts) {
            if (hasText(part)) {
                encodedParts.add(urlEncode(part.trim()));
            }
        }
        return String.join("/", encodedParts);
    }

    private String urlEncode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
    }

    private Long requireRepoId(Long repoId) {
        if (repoId == null || repoId <= 0L) {
            throw new IllegalArgumentException("Woodpecker repo id 不能为空");
        }
        return repoId;
    }

    private Long requireCronId(Long cronId) {
        if (cronId == null || cronId <= 0L) {
            throw new IllegalArgumentException("Woodpecker cron id 不能为空");
        }
        return cronId;
    }

    private String normalizeSecretName(String secretName) {
        String normalized = secretName == null ? "" : secretName.trim().toUpperCase();
        if (!normalized.matches("[A-Z0-9_]+")) {
            throw new IllegalArgumentException("Woodpecker secret 名称仅支持大写字母、数字和下划线");
        }
        return normalized;
    }

    private boolean isNotFound(IllegalStateException exception) {
        String message = exception.getMessage();
        return message != null && (message.contains("HTTP 状态码: 404") || message.contains("not found") || message.contains("Not Found"));
    }

    private String abbreviate(String value, int maxLength) {
        if (!hasText(value)) {
            return "";
        }
        return value.length() <= maxLength ? value : value.substring(0, maxLength);
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    public record WoodpeckerUser(Long id, String username, String displayName) {
    }

    public record WoodpeckerRepository(
            Long id,
            String forgeRemoteId,
            String owner,
            String name,
            String fullName,
            String forgeUrl,
            String cloneUrl,
            String defaultBranch,
            String configFile,
            boolean active
    ) {
    }

    public record WoodpeckerPipeline(
            Long id,
            Integer number,
            String status,
            String branch,
            String event,
            String message,
            String commit,
            String forgeUrl,
            LocalDateTime createdAt,
            LocalDateTime startedAt,
            LocalDateTime finishedAt,
            List<WoodpeckerStep> steps
    ) {
    }

    public record WoodpeckerStep(Long id, String name, String state, Integer exitCode) {
    }

    public record WoodpeckerSecret(
            Long id,
            Long repoId,
            String name,
            String note,
            String value,
            List<String> events,
            List<String> images
    ) {
    }

    public record WoodpeckerCron(
            Long id,
            String name,
            String cronExpression,
            String branch,
            boolean enabled,
            LocalDateTime nextRunAt
    ) {
    }
}
