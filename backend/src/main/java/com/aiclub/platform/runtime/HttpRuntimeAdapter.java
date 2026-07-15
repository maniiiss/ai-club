package com.aiclub.platform.runtime;

import com.aiclub.platform.service.InternalServiceAuthenticator;
import com.aiclub.platform.service.RuntimeRegistryService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.Consumer;

/**
 * 平台托管 HTTP Runtime 适配器。
 * 业务编排只调用本类的统一契约，Pi 和 code-processing 的协议差异被收敛在这里。
 */
public final class HttpRuntimeAdapter implements RuntimeAdapter {

    private static final String PI_RUN_PATH = "/internal/runtime/runs";
    private static final String PI_CHAT_PATH = "/internal/runtime/chat";
    private static final String RUNTIME_CHAT_STREAM_PATH = "/internal/runtime/chat/stream";
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

    @Override
    public RuntimeChatResult chat(RuntimeInvocationContext context) {
        if (!"PI_RUNTIME".equals(runtimeCode)) {
            throw new UnsupportedOperationException("Runtime does not support synchronous chat: " + runtimeCode);
        }
        JsonNode response = send("POST", baseUrl() + PI_CHAT_PATH, requestBody(context).toString(), true);
        return new RuntimeChatResult(
                text(response, "runId", context.runId()),
                text(response, "sessionId", context.sessionId()),
                text(response, "content", ""),
                RuntimeHealthStatus.HEALTHY
        );
    }

    /**
     * 读取所有 AgentRuntime 共用的 NDJSON 聊天流。
     * 业务意图：HTTP 传输层只负责逐行解码，文本、工具和生命周期事件由上层按统一事件类型处理。
     */
    @Override
    public RuntimeChatResult streamChat(RuntimeInvocationContext context,
                                         Consumer<RuntimeStreamEvent> eventConsumer) {
        if (!supports(com.aiclub.platform.runtime.RuntimeCapability.STREAM_EVENTS)) {
            return RuntimeAdapter.super.streamChat(context, eventConsumer);
        }

        HttpRequest.Builder builder = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl() + RUNTIME_CHAT_STREAM_PATH))
                .timeout(Duration.ofSeconds(120))
                .header("Accept", "application/x-ndjson")
                .header("Content-Type", "application/json");
        if (authenticator != null) {
            builder.header("Authorization", authenticator.authorizationHeaderValue());
        }

        String runId = context.runId();
        String sessionId = context.sessionId();
        StringBuilder content = new StringBuilder();
        RuntimeStreamContentAssembler contentAssembler = new RuntimeStreamContentAssembler();
        boolean completed = false;
        String failureMessage = "";
        try {
            HttpResponse<InputStream> response = httpClient.send(
                    builder.POST(HttpRequest.BodyPublishers.ofString(
                            requestBody(context).toString(), StandardCharsets.UTF_8)).build(),
                    HttpResponse.BodyHandlers.ofInputStream());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                String errorBody;
                try (InputStream inputStream = response.body()) {
                    errorBody = new String(inputStream.readAllBytes(), StandardCharsets.UTF_8);
                }
                throw new IllegalStateException("Runtime 流式请求失败，HTTP " + response.statusCode() + ": " + errorBody);
            }

            try (BufferedReader reader = new BufferedReader(new InputStreamReader(response.body(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    if (line.isBlank()) {
                        continue;
                    }
                    RuntimeStreamEvent event = parseStreamEvent(line, context, runId, sessionId);
                    if (!event.runId().isBlank()) runId = event.runId();
                    if (!event.sessionId().isBlank()) sessionId = event.sessionId();
                    String displayDelta = contentAssembler.accept(event);
                    if (!displayDelta.isEmpty()) content.append(displayDelta);
                    if (event.is("RUN_COMPLETED")) completed = true;
                    if (event.is("RUN_FAILED")) {
                        Object message = event.payload().get("message");
                        failureMessage = message == null ? "Runtime 执行失败" : String.valueOf(message);
                    }
                    if (eventConsumer != null) eventConsumer.accept(event);
                }
            }
        } catch (IOException exception) {
            throw new IllegalStateException("Runtime 流式响应读取失败", exception);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Runtime 流式请求被中断", exception);
        }
        if (!failureMessage.isBlank()) {
            throw new IllegalStateException(failureMessage);
        }
        if (!completed) {
            throw new IllegalStateException("Runtime 流式响应未收到完成事件");
        }
        String closingDelta = contentAssembler.finish();
        if (!closingDelta.isEmpty()) content.append(closingDelta);
        return new RuntimeChatResult(runId, sessionId, content.toString(), RuntimeHealthStatus.HEALTHY);
    }

    private RuntimeStreamEvent parseStreamEvent(String line,
                                                 RuntimeInvocationContext context,
                                                 String fallbackRunId,
                                                 String fallbackSessionId) {
        try {
            JsonNode node = objectMapper.readTree(line);
            Map<String, Object> payload = node.has("payload") && node.get("payload").isObject()
                    ? objectMapper.convertValue(node.get("payload"), new TypeReference<Map<String, Object>>() {})
                    : Map.of();
            return new RuntimeStreamEvent(
                    text(node, "runId", fallbackRunId),
                    text(node, "sessionId", fallbackSessionId),
                    node.path("sequence").asLong(0),
                    text(node, "eventType", ""),
                    payload
            );
        } catch (Exception exception) {
            throw new IllegalStateException("Runtime 流式事件格式无效: " + line, exception);
        }
    }

    private JsonNode requestBody(RuntimeInvocationContext context) {
        Object supplied = context.variables().get("requestBody");
        ObjectNode payload;
        if (supplied instanceof JsonNode jsonNode && jsonNode.isObject()) {
            payload = (ObjectNode) jsonNode.deepCopy();
        } else if (supplied != null && objectMapper.valueToTree(supplied).isObject()) {
            payload = (ObjectNode) objectMapper.valueToTree(supplied);
        } else {
            Map<String, Object> fallback = new LinkedHashMap<>();
            fallback.put("runId", context.runId());
            fallback.put("sessionId", context.sessionId());
            fallback.put("input", context.input());
            fallback.put("systemPrompt", context.systemPrompt());
            fallback.put("profileSnapshot", context.profileSnapshot());
            payload = objectMapper.valueToTree(fallback);
        }
        if (context.toolContext() != null) {
            // 所有 HTTP Runtime 共用这两个字段；具体 Runtime 再转换为自己的原生工具协议。
            payload.set("tools", objectMapper.valueToTree(context.toolContext().tools()));
            payload.set("toolPolicy", objectMapper.valueToTree(context.toolContext().policy()));
            payload.put("runtimeToolContractVersion", context.toolContext().contractVersion());
        }
        if (!payload.has("contextProfile")) {
            payload.set("contextProfile", objectMapper.valueToTree(descriptor().contextProfile()));
        }
        return payload;
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
