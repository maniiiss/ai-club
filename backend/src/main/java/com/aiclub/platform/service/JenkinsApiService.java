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
import java.util.Base64;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class JenkinsApiService {

    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    public JenkinsApiService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .build();
    }

    public JenkinsServerInfo fetchServerInfo(String baseUrl, String username, String apiToken) {
        HttpResponse<String> response = sendRequest("GET",
                normalizeBaseUrl(baseUrl) + "/api/json?tree=nodeDescription,primaryView[name],jobs[name]",
                username,
                apiToken,
                Map.of("Accept", "application/json"),
                null);
        JsonNode node = readJson(response.body());
        JsonNode jobsNode = node.path("jobs");
        int jobCount = jobsNode.isArray() ? jobsNode.size() : 0;
        String version = response.headers().firstValue("X-Jenkins").orElse("");
        return new JenkinsServerInfo(
                node.path("nodeDescription").asText(""),
                node.path("primaryView").path("name").asText(""),
                version,
                jobCount
        );
    }

    public List<JenkinsJob> listJobs(String baseUrl, String username, String apiToken) {
        JsonNode arrayNode = readJson(sendRequest("GET",
                normalizeBaseUrl(baseUrl) + "/api/json?tree=jobs[name,fullName,url,color,lastBuild[number,url,result,timestamp]]",
                username,
                apiToken,
                Map.of("Accept", "application/json"),
                null).body()).path("jobs");
        List<JenkinsJob> jobs = new ArrayList<>();
        if (arrayNode.isArray()) {
            for (JsonNode node : arrayNode) {
                jobs.add(toJob(node));
            }
        }
        return jobs;
    }

    public JenkinsJob fetchJob(String baseUrl, String username, String apiToken, String jobName) {
        String url = normalizeBaseUrl(baseUrl)
                + buildJobPath(jobName)
                + "/api/json?tree=name,fullName,url,color,lastBuild[number,url,result,timestamp],property[parameterDefinitions[name]]";
        JsonNode node = readJson(sendRequest("GET", url, username, apiToken, Map.of("Accept", "application/json"), null).body());
        return toJob(node);
    }

    public List<JenkinsBuildInfo> listBuilds(String baseUrl, String username, String apiToken, String jobName, int limit) {
        String url = normalizeBaseUrl(baseUrl)
                + buildJobPath(jobName)
                + "/api/json?tree=builds[number,url,result,building,timestamp,duration,description]";
        JsonNode buildsNode = readJson(sendRequest("GET", url, username, apiToken, Map.of("Accept", "application/json"), null).body()).path("builds");
        List<JenkinsBuildInfo> builds = new ArrayList<>();
        if (buildsNode.isArray()) {
            int max = Math.max(1, Math.min(limit, 100));
            for (JsonNode buildNode : buildsNode) {
                if (builds.size() >= max) {
                    break;
                }
                builds.add(toBuild(buildNode));
            }
        }
        return builds;
    }

    public JenkinsBuildInfo fetchBuild(String baseUrl, String username, String apiToken, String jobName, int buildNumber) {
        String url = normalizeBaseUrl(baseUrl)
                + buildJobPath(jobName)
                + "/" + buildNumber
                + "/api/json?tree=number,url,result,building,timestamp,duration,description";
        JsonNode node = readJson(sendRequest("GET", url, username, apiToken, Map.of("Accept", "application/json"), null).body());
        return toBuild(node);
    }

    public String fetchBuildConsoleLog(String baseUrl, String username, String apiToken, String jobName, int buildNumber) {
        String url = normalizeBaseUrl(baseUrl)
                + buildJobPath(jobName)
                + "/" + buildNumber
                + "/consoleText";
        return sendRequest("GET", url, username, apiToken, Map.of("Accept", "text/plain"), null).body();
    }

    public JenkinsTriggerResult triggerJob(String baseUrl, String username, String apiToken, String jobName, Map<String, String> parameters) {
        Crumb crumb = fetchCrumb(baseUrl, username, apiToken);
        Map<String, String> headers = new LinkedHashMap<>();
        headers.put("Accept", "application/json");
        if (crumb != null) {
            headers.put(crumb.requestField(), crumb.crumb());
        }

        boolean hasParameters = parameters != null && !parameters.isEmpty();
        String endpoint = normalizeBaseUrl(baseUrl) + buildJobPath(jobName) + "/build";
        String body = null;
        if (hasParameters) {
            headers.put("Content-Type", "application/x-www-form-urlencoded");
            body = toJsonFormBody(parameters);
        }
        HttpResponse<String> response = sendRequest("POST", endpoint, username, apiToken, headers, body);
        String triggerUrl = response.headers().firstValue("Location").orElse("");
        return new JenkinsTriggerResult(triggerUrl, hasText(triggerUrl) ? "已提交 Jenkins 构建请求" : "已触发 Jenkins 构建");
    }

    private Crumb fetchCrumb(String baseUrl, String username, String apiToken) {
        String url = normalizeBaseUrl(baseUrl) + "/crumbIssuer/api/json";
        try {
            HttpResponse<String> response = sendRequest("GET", url, username, apiToken, Map.of("Accept", "application/json"), null);
            JsonNode node = readJson(response.body());
            String requestField = node.path("crumbRequestField").asText("");
            String crumbValue = node.path("crumb").asText("");
            if (hasText(requestField) && hasText(crumbValue)) {
                return new Crumb(requestField, crumbValue);
            }
            return null;
        } catch (IllegalStateException exception) {
            String message = exception.getMessage();
            if (message != null && (message.contains("HTTP 状态码: 404") || message.contains("Not Found"))) {
                return null;
            }
            throw exception;
        }
    }

    private HttpResponse<String> sendRequest(String method,
                                             String url,
                                             String username,
                                             String apiToken,
                                             Map<String, String> headers,
                                             String body) {
        try {
            HttpRequest.Builder builder = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(Duration.ofSeconds(20))
                    .header("Authorization", buildAuthorization(username, apiToken));

            if (headers != null) {
                headers.forEach(builder::header);
            }

            if (body == null) {
                builder.method(method, HttpRequest.BodyPublishers.noBody());
            } else {
                builder.method(method, HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8));
            }

            HttpResponse<String> response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.statusCode() >= 200 && response.statusCode() < 300) {
                return response;
            }
            throw new IllegalStateException(extractError(response));
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("调用 Jenkins API 失败", exception);
        } catch (IOException exception) {
            throw new IllegalStateException("调用 Jenkins API 失败", exception);
        }
    }

    private String extractError(HttpResponse<String> response) {
        String body = response.body() == null ? "" : response.body().trim();
        try {
            JsonNode node = objectMapper.readTree(body);
            if (node.hasNonNull("message")) {
                return "Jenkins API 错误: " + node.path("message").asText();
            }
        } catch (Exception ignored) {
        }
        if (hasText(body)) {
            return "Jenkins API 错误，HTTP 状态码: " + response.statusCode() + "，响应: " + abbreviate(body, 300);
        }
        return "Jenkins API 错误，HTTP 状态码: " + response.statusCode();
    }

    private String buildAuthorization(String username, String apiToken) {
        String credential = (username == null ? "" : username.trim()) + ":" + (apiToken == null ? "" : apiToken.trim());
        return "Basic " + Base64.getEncoder().encodeToString(credential.getBytes(StandardCharsets.UTF_8));
    }

    private String buildJobPath(String jobName) {
        String value = jobName == null ? "" : jobName.trim();
        if (value.isEmpty()) {
            throw new IllegalArgumentException("Jenkins Job 名称不能为空");
        }
        StringBuilder builder = new StringBuilder();
        for (String part : value.split("/")) {
            String segment = part.trim();
            if (!segment.isEmpty()) {
                builder.append("/job/").append(urlEncode(segment));
            }
        }
        if (builder.isEmpty()) {
            throw new IllegalArgumentException("Jenkins Job 名称不能为空");
        }
        return builder.toString();
    }

    private String toFormBody(Map<String, String> parameters) {
        return parameters.entrySet().stream()
                .map(entry -> urlEncode(entry.getKey()) + "=" + urlEncode(entry.getValue()))
                .reduce((left, right) -> left + "&" + right)
                .orElse("");
    }

    /**
     * 使用 Jenkins 官方 Remote API 推荐的 json 参数格式触发构建，
     * 兼容普通参数和部分对 buildWithParameters 支持不一致的 Job 类型。
     */
    private String toJsonFormBody(Map<String, String> parameters) {
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            List<Map<String, String>> parameterList = new ArrayList<>();
            parameters.forEach((name, value) -> parameterList.add(Map.of(
                    "name", name,
                    "value", value == null ? "" : value
            )));
            payload.put("parameter", parameterList);
            return toFormBody(Map.of("json", objectMapper.writeValueAsString(payload)));
        } catch (Exception exception) {
            throw new IllegalStateException("构造 Jenkins 构建参数失败", exception);
        }
    }

    private JsonNode readJson(String body) {
        try {
            if (!hasText(body)) {
                return objectMapper.createObjectNode();
            }
            return objectMapper.readTree(body);
        } catch (Exception exception) {
            throw new IllegalStateException("解析 Jenkins 返回数据失败", exception);
        }
    }

    private JenkinsJob toJob(JsonNode node) {
        JsonNode lastBuildNode = node.path("lastBuild");
        JenkinsBuild build = null;
        if (!lastBuildNode.isMissingNode() && !lastBuildNode.isNull() && lastBuildNode.hasNonNull("number")) {
            build = new JenkinsBuild(
                    lastBuildNode.path("number").asInt(),
                    lastBuildNode.path("url").asText(""),
                    lastBuildNode.path("result").asText(""),
                    lastBuildNode.path("timestamp").asLong(0L)
            );
        }
        List<String> parameterNames = new ArrayList<>();
        appendParameterNames(parameterNames, node.path("property"));
        return new JenkinsJob(
                node.path("name").asText(""),
                node.path("fullName").asText(node.path("name").asText("")),
                node.path("url").asText(""),
                node.path("color").asText(""),
                build,
                List.copyOf(parameterNames)
        );
    }

    /**
     * Jenkins Job 的参数定义通常挂在 property 节点下，这里统一抽取成参数名列表，
     * 供上层判断是否需要自动补充分支参数。
     */
    private void appendParameterNames(Collection<String> target, JsonNode propertyNode) {
        if (target == null || propertyNode == null || !propertyNode.isArray()) {
            return;
        }
        for (JsonNode item : propertyNode) {
            JsonNode parameterDefinitionsNode = item.path("parameterDefinitions");
            if (!parameterDefinitionsNode.isArray()) {
                continue;
            }
            for (JsonNode parameterDefinitionNode : parameterDefinitionsNode) {
                String parameterName = parameterDefinitionNode.path("name").asText("");
                if (hasText(parameterName) && !target.contains(parameterName)) {
                    target.add(parameterName);
                }
            }
        }
    }

    private JenkinsBuildInfo toBuild(JsonNode node) {
        return new JenkinsBuildInfo(
                node.path("number").asInt(),
                node.path("url").asText(""),
                node.path("result").isMissingNode() || node.path("result").isNull() ? null : node.path("result").asText(""),
                node.path("building").asBoolean(false),
                node.path("timestamp").asLong(0L),
                node.path("duration").asLong(0L),
                node.path("description").isMissingNode() || node.path("description").isNull() ? null : node.path("description").asText("")
        );
    }

    private String normalizeBaseUrl(String baseUrl) {
        String value = baseUrl == null ? "" : baseUrl.trim();
        while (value.endsWith("/")) {
            value = value.substring(0, value.length() - 1);
        }
        return value;
    }

    private String urlEncode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
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

    public record JenkinsServerInfo(String displayName, String primaryViewName, String version, int jobCount) {
    }

    public record JenkinsJob(String name, String fullName, String url, String color, JenkinsBuild lastBuild, List<String> parameterNames) {
    }

    public record JenkinsBuild(int number, String url, String result, long timestamp) {
    }

    public record JenkinsTriggerResult(String triggerUrl, String message) {
    }

    public record JenkinsBuildInfo(int number, String url, String result, boolean building, long timestamp, long duration, String description) {
    }

    private record Crumb(String requestField, String crumb) {
    }
}
