package com.aiclub.platform.runtime;

import com.aiclub.platform.service.InternalServiceAuthenticator;
import com.aiclub.platform.service.RuntimeRegistryService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 平台托管 HTTP Runtime 适配器。
 * 业务编排只调用本类的统一契约，Pi 和 code-processing 的协议差异被收敛在这里。
 */
public final class HttpRuntimeAdapter implements RuntimeAdapter {

    private static final String PI_RUN_PATH = "/internal/runtime/runs";
    private static final String CLI_RUN_PATH = "/api/code/cli-executions/start";

    private final RuntimeRegistryService registryService;
    private final String runtimeCode;
    private final String piBaseUrl;
    private final String codeProcessingBaseUrl;
    private final InternalServiceAuthenticator authenticator;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    public HttpRuntimeAdapter(RuntimeRegistryService registryService,
                              String runtimeCode,
                              String piBaseUrl,
                              String codeProcessingBaseUrl,
                              InternalServiceAuthenticator authenticator,
                              ObjectMapper objectMapper) {
        this.registryService = registryService;
        this.runtimeCode = runtimeCode;
        this.piBaseUrl = trimSlash(piBaseUrl);
        this.codeProcessingBaseUrl = trimSlash(codeProcessingBaseUrl);
        this.authenticator = authenticator;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10))
                .version(HttpClient.Version.HTTP_1_1).build();
    }

    @Override
    public RuntimeDescriptor descriptor() {
        return registryService.descriptor(runtimeCode);
    }

    @Override
    public RuntimeHealth healthCheck() {
        String base = baseUrl();
        if (base.isBlank()) return RuntimeHealth.unknown(runtimeCode, "Runtime 未配置受控 endpoint");
        try {
            HttpResponse<Void> response = httpClient.send(HttpRequest.newBuilder()
                    .uri(URI.create(base + ("PI_RUNTIME".equals(runtimeCode) ? "/healthz" : "/health")))
                    .timeout(Duration.ofSeconds(5)).GET().build(), HttpResponse.BodyHandlers.discarding());
            RuntimeHealthStatus status = response.statusCode() >= 200 && response.statusCode() < 300
                    ? RuntimeHealthStatus.HEALTHY : RuntimeHealthStatus.UNHEALTHY;
            return new RuntimeHealth(runtimeCode, status, "HTTP " + response.statusCode(), java.time.LocalDateTime.now());
        } catch (Exception exception) {
            return new RuntimeHealth(runtimeCode, RuntimeHealthStatus.UNHEALTHY,
                    "健康检查失败: " + exception.getMessage(), java.time.LocalDateTime.now());
        }
    }

    @Override
    public RuntimeRunHandle start(RuntimeInvocationContext context) {
        JsonNode body = requestBody(context);
        String path = "PI_RUNTIME".equals(runtimeCode) ? PI_RUN_PATH : CLI_RUN_PATH;
        JsonNode response = send("POST", baseUrl() + path, body.toString(), true);
        String runId = text(response, "runId", context.runId());
        String sessionId = text(response, "sessionId", context.sessionId());
        return new RuntimeRunHandle(runId, sessionId, RuntimeHealthStatus.HEALTHY);
    }

    @Override
    public RuntimeRunHandle resume(RuntimeInvocationContext context) {
        if (!"PI_RUNTIME".equals(runtimeCode)) {
            throw new UnsupportedOperationException("CLI Runtime 不支持会话恢复");
        }
        JsonNode response = send("POST", baseUrl() + "/internal/runtime/sessions/"
                + encode(context.sessionId()) + "/resume", requestBody(context).toString(), true);
        return new RuntimeRunHandle(text(response, "runId", context.runId()),
                text(response, "sessionId", context.sessionId()), RuntimeHealthStatus.HEALTHY);
    }

    @Override
    public void cancel(String runId, Map<String, Object> metadata) {
        if ("PI_RUNTIME".equals(runtimeCode)) {
            send("POST", baseUrl() + "/internal/runtime/runs/" + encode(runId) + "/cancel", "{}", true);
        }
    }

    @Override
    public String invoke(RuntimeInvocationContext context) {
        JsonNode body = requestBody(context);
        String path = "PI_RUNTIME".equals(runtimeCode) ? PI_RUN_PATH : "/api/code/cli-executions";
        return send("POST", baseUrl() + path, body.toString(), true).toPrettyString();
    }

    private JsonNode requestBody(RuntimeInvocationContext context) {
        Object supplied = context.variables().get("requestBody");
        if (supplied instanceof JsonNode jsonNode) return jsonNode;
        if (supplied != null) return objectMapper.valueToTree(supplied);
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("runId", context.runId());
        payload.put("sessionId", context.sessionId());
        payload.put("input", context.input());
        payload.put("systemPrompt", context.systemPrompt());
        payload.put("profileSnapshot", context.profileSnapshot());
        return objectMapper.valueToTree(payload);
    }

    private JsonNode send(String method, String url, String body, boolean internalAuth) {
        try {
            HttpRequest.Builder builder = HttpRequest.newBuilder().uri(URI.create(url))
                    .timeout(Duration.ofSeconds(120)).header("Accept", "application/json")
                    .header("Content-Type", "application/json");
            if (internalAuth && authenticator != null) {
                builder.header("Authorization", authenticator.authorizationHeaderValue());
            }
            HttpResponse<String> response = httpClient.send(builder.method(method,
                    HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8)).build(),
                    HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new IllegalStateException("Runtime 请求失败，HTTP " + response.statusCode() + ": " + response.body());
            }
            return objectMapper.readTree(response.body() == null || response.body().isBlank() ? "{}" : response.body());
        } catch (IOException exception) {
            throw new IllegalStateException("Runtime 请求失败", exception);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Runtime 请求被中断", exception);
        }
    }

    private String baseUrl() {
        return "PI_RUNTIME".equals(runtimeCode) ? piBaseUrl : codeProcessingBaseUrl;
    }

    private String text(JsonNode node, String field, String fallback) {
        return node != null && node.hasNonNull(field) && !node.get(field).asText().isBlank()
                ? node.get(field).asText() : fallback;
    }

    private String encode(String value) { return java.net.URLEncoder.encode(value == null ? "" : value, StandardCharsets.UTF_8); }
    private String trimSlash(String value) { return value == null ? "" : value.replaceFirst("/+$", ""); }
}
