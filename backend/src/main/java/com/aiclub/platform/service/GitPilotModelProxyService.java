package com.aiclub.platform.service;

import com.aiclub.platform.agentusage.AgentInvocationContext;
import com.aiclub.platform.agentusage.AgentInvocationRecorder;
import com.aiclub.platform.agentusage.AgentType;
import com.aiclub.platform.agentusage.TriggerSource;
import com.aiclub.platform.agentusage.UsageSink;
import com.aiclub.platform.config.GitPilotCliProperties;
import com.aiclub.platform.security.AuthContext;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Set;

/**
 * GitPilot CLI 模型安全代理。
 * 业务意图：CLI 只发送 Pi 标准请求，backend 在服务端解析真实模型地址和 API Key 后流式转发。
 */
@Service
public class GitPilotModelProxyService {

    private static final Logger log = LoggerFactory.getLogger(GitPilotModelProxyService.class);

    private final GitPilotCliService cliService;
    private final ModelConfigService modelConfigService;
    private final GitPilotCliProperties properties;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final AgentInvocationRecorder agentInvocationRecorder;
    private final GitPilotModelCreditService cliModelCreditService;
    private final CreditService creditService;

    public GitPilotModelProxyService(GitPilotCliService cliService,
                                     ModelConfigService modelConfigService,
                                     GitPilotCliProperties properties,
                                     ObjectMapper objectMapper,
                                     AgentInvocationRecorder agentInvocationRecorder,
                                     GitPilotModelCreditService cliModelCreditService,
                                     CreditService creditService) {
        this.cliService = cliService;
        this.modelConfigService = modelConfigService;
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.agentInvocationRecorder = agentInvocationRecorder;
        this.cliModelCreditService = cliModelCreditService;
        this.creditService = creditService;
        this.httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    }

    /** 代理 OpenAI Chat Completions 或 Anthropic Messages 的流式响应。 */
    public void stream(String sessionId,
                       String credential,
                       String apiPath,
                       String rawBody,
                       HttpServletRequest servletRequest,
                       HttpServletResponse servletResponse) {
        if (rawBody == null || rawBody.getBytes(StandardCharsets.UTF_8).length > properties.modelProxyMaxRequestBytes()) {
            servletResponse.setStatus(HttpServletResponse.SC_REQUEST_ENTITY_TOO_LARGE);
            return;
        }
        GitPilotCliService.ModelSessionState state = cliService.requireModelSession(sessionId, credential);
        // 模型启用 token 计费时，转发前做余额门槛预检：余额不足直接拒绝，避免零余额用户免费服务后再扣费失败。
        if (cliModelCreditService.isTokenBillingEnabled(state.modelConfigId())
                && state.userId() != null
                && creditService.getCreditBalance(state.userId()) <= 0) {
            try {
                servletResponse.setStatus(HttpServletResponse.SC_PAYMENT_REQUIRED);
                servletResponse.setCharacterEncoding(StandardCharsets.UTF_8.name());
                servletResponse.setContentType("application/json; charset=utf-8");
                servletResponse.getWriter().write("{\"error\":\"积分余额不足，请联系管理员充值\"}");
            } catch (IOException ignored) {
                // 响应写出失败不影响拒绝语义，状态码已设置。
            }
            return;
        }
        var summary = modelConfigService.getConfig(state.modelConfigId());
        if (!Boolean.TRUE.equals(summary.enabled()) || !ModelConfigService.MODEL_TYPE_CHAT.equalsIgnoreCase(summary.modelType())) throw new IllegalArgumentException("模型未启用或不是 CHAT 模型");
        ModelConfigService.ResolvedModelConfig config = modelConfigService.resolveModelConfig(state.modelConfigId());
        String provider = config.provider().toUpperCase();
        if ("OPENAI".equals(provider) && !"chat/completions".equals(apiPath)) throw new IllegalArgumentException("OpenAI 模型只支持 chat/completions");
        if ("ANTHROPIC".equals(provider) && !"messages".equals(apiPath)) throw new IllegalArgumentException("Anthropic 模型只支持 messages");
        if (!"OPENAI".equals(provider) && !"ANTHROPIC".equals(provider)) throw new IllegalArgumentException("不支持的模型 provider");

        try {
            var parsedBody = objectMapper.readTree(rawBody);
            if (parsedBody == null || !parsedBody.isObject()) throw new IllegalArgumentException("模型请求体必须是 JSON 对象");
            ObjectNode payload = (ObjectNode) parsedBody;
            payload.put("model", config.modelName());
            payload.put("stream", true);
            if ("OPENAI".equals(provider)) {
                // 开启 usage 回传：OpenAI 兼容网关在流末追加携带 usage 的 chunk，
                // 供代理嗅探落账。Anthropic 的 message_start/message_delta 默认即带 usage。
                ObjectNode streamOptions = objectMapper.createObjectNode();
                streamOptions.put("include_usage", true);
                payload.set("stream_options", streamOptions);
            }
            String upstreamUrl = trimSlash(config.apiBaseUrl()) + "/" + apiPath;
            HttpRequest.Builder builder = HttpRequest.newBuilder()
                    .uri(URI.create(upstreamUrl))
                    .timeout(Duration.ofSeconds(properties.modelProxyTimeoutSeconds()))
                    .header("content-type", "application/json")
                    .header("accept", "text/event-stream");
            if ("OPENAI".equals(provider)) {
                builder.header("authorization", "Bearer " + config.apiKey());
            } else {
                builder.header("x-api-key", config.apiKey());
                builder.header("anthropic-version", defaultHeader(servletRequest.getHeader("anthropic-version"), "2023-06-01"));
            }
            // CLI 本地推理埋点：把 gms_ 会话绑定的用户与模型配置写入 agent_invocation_log。
            AgentInvocationRecorder.ManualHandle usageHandle = beginCliTracking(state, config, provider);
            try {
                HttpResponse<InputStream> upstream = httpClient.send(
                        builder.POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(payload), StandardCharsets.UTF_8)).build(),
                        HttpResponse.BodyHandlers.ofInputStream()
                );
                servletResponse.setStatus(upstream.statusCode());
                servletResponse.setCharacterEncoding(StandardCharsets.UTF_8.name());
                servletResponse.setContentType(upstream.headers().firstValue("content-type").orElse("text/event-stream; charset=utf-8"));
                servletResponse.setHeader("cache-control", "no-cache, no-transform");
                UsageAccumulator usage = new UsageAccumulator();
                try (InputStream input = upstream.body()) {
                    forwardStreamAndSniffUsage(input, servletResponse.getOutputStream(), provider, usage);
                }
                if (usageHandle != null) {
                    UsageSink sink = usageHandle.sink();
                    sink.setUsage(usage.promptTokens, usage.completionTokens, usage.totalTokens, usage.cachedTokens);
                    // 按本次实际 token 即时计费并回填 cost_credits；模型未启用计费时返回 0 不扣费。
                    try {
                        sink.setCostCredits(cliModelCreditService.chargeForModelCall(
                                state.userId(), state.modelConfigId(), state.sessionId(),
                                usage.promptTokens, usage.completionTokens, usage.cachedTokens));
                    } catch (RuntimeException ex) {
                        // 计费失败不阻断已写出的流式响应，仅记录告警；后续调用仍受转发前余额预检约束。
                        log.warn("GitPilot CLI 模型调用计费失败：sessionId={}, modelConfigId={}, userId={}, message={}",
                                state.sessionId(), state.modelConfigId(), state.userId(), ex.getMessage());
                    }
                    usageHandle.commit();
                }
            } catch (RuntimeException | IOException ex) {
                if (usageHandle != null) {
                    usageHandle.fail(ex);
                }
                throw ex;
            }
        } catch (IOException exception) {
            throw new IllegalStateException("模型平台代理请求失败", exception);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("模型平台代理请求被中断", exception);
        }
    }

    /**
     * 构造 CLI 本地推理埋点上下文并启动手动生命周期句柄。
     * 用户身份取自 gms_ 会话状态（userId），无需新增鉴权。
     */
    private AgentInvocationRecorder.ManualHandle beginCliTracking(GitPilotCliService.ModelSessionState state,
                                                                   ModelConfigService.ResolvedModelConfig config,
                                                                   String provider) {
        if (agentInvocationRecorder == null) {
            return null;
        }
        AuthContext authSnapshot = state.userId() == null ? null
                : new AuthContext(state.userId(), state.username(), state.nickname(), Set.of(), Set.of());
        AgentInvocationContext ctx = AgentInvocationContext.builder(AgentType.GITPILOT_CLI)
                .action("MODEL_PROXY")
                .triggerSource(TriggerSource.USER_DIRECT)
                .provider(provider)
                .modelName(config.modelName())
                .modelConfigId(config.id())
                .captureAuthContext(authSnapshot)
                .build();
        return agentInvocationRecorder.startManual(ctx);
    }

    /**
     * 边转发 SSE 流边嗅探 usage：逐行读上游、原样写出（保持流式忠实），并解析
     * {@code data:} 行的 usage。usage 缺失不影响转发与落账（token 留空）。
     * 包级私有以便单元测试覆盖解析逻辑。
     */
    void forwardStreamAndSniffUsage(InputStream input, OutputStream output, String provider,
                                    UsageAccumulator usage) throws IOException {
        StringBuilder eventData = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                // 原样写出该行 + 换行，保持 SSE 事件边界不变。
                output.write((line + "\n").getBytes(StandardCharsets.UTF_8));
                output.flush();
                if (line.startsWith("data:")) {
                    if (eventData.length() > 0) {
                        eventData.append('\n');
                    }
                    eventData.append(line.substring("data:".length()).trim());
                } else if (line.isEmpty()) {
                    // 事件结束，尝试解析累积的 data。
                    if (eventData.length() > 0 && !"[DONE]".equals(eventData.toString())) {
                        usage.observe(eventData.toString(), provider);
                    }
                    eventData.setLength(0);
                }
            }
        }
    }

    /**
     * 流式 usage 累加器：兼容 OpenAI（流末 chunk 顶层 usage）与
     * Anthropic（message_start 的 input + message_delta 的 output）两种协议。
     * 包级私有以便单元测试覆盖。
     */
    final class UsageAccumulator {
        Integer promptTokens;
        Integer completionTokens;
        Integer totalTokens;
        Integer cachedTokens;

        void observe(String jsonData, String provider) {
            try {
                JsonNode node = objectMapper.readTree(jsonData);
                if ("OPENAI".equals(provider)) {
                    JsonNode usageNode = node.path("usage");
                    if (usageNode.isObject()) {
                        Integer p = readInt(usageNode, "prompt_tokens", "input_tokens");
                        Integer c = readInt(usageNode, "completion_tokens", "output_tokens");
                        Integer t = readInt(usageNode, "total_tokens");
                        if (p != null) promptTokens = p;
                        if (c != null) completionTokens = c;
                        if (t != null) totalTokens = t;
                        Integer cached = readInt(usageNode, "cached_tokens");
                        if (cached == null) {
                            JsonNode details = usageNode.path("prompt_tokens_details");
                            if (details.isObject()) {
                                cached = readInt(details, "cached_tokens");
                            }
                        }
                        if (cached == null) {
                            JsonNode inputDetails = usageNode.path("input_tokens_details");
                            if (inputDetails.isObject()) {
                                cached = readInt(inputDetails, "cached_tokens");
                            }
                        }
                        if (cached != null) cachedTokens = cached;
                    }
                } else if ("ANTHROPIC".equals(provider)) {
                    String type = node.path("type").asText("");
                    if ("message_start".equals(type)) {
                        JsonNode usageNode = node.path("message").path("usage");
                        if (usageNode.isObject()) {
                            Integer p = readInt(usageNode, "input_tokens");
                            if (p != null) promptTokens = p;
                            Integer cachedRead = readInt(usageNode, "cache_read_input_tokens");
                            if (cachedRead != null) cachedTokens = cachedRead;
                        }
                    } else if ("message_delta".equals(type)) {
                        JsonNode usageNode = node.path("usage");
                        if (usageNode.isObject()) {
                            Integer c = readInt(usageNode, "output_tokens");
                            // message_delta 的 output_tokens 为累计值，最后一次即最终输出。
                            if (c != null) completionTokens = c;
                        }
                    }
                }
            } catch (Exception ignored) {
                // usage 解析失败不影响转发主链路。
            }
        }

        private Integer readInt(JsonNode usage, String... keys) {
            for (String key : keys) {
                JsonNode node = usage.path(key);
                if (node.isNumber()) {
                    return node.asInt();
                }
            }
            return null;
        }
    }

    private String trimSlash(String value) {
        String result = value == null ? "" : value.trim();
        while (result.endsWith("/")) result = result.substring(0, result.length() - 1);
        return result;
    }

    private String defaultHeader(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }
}
