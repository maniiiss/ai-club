package com.aiclub.platform.service;

import com.aiclub.platform.config.GitPilotCliProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

/**
 * GitPilot CLI 模型安全代理。
 * 业务意图：CLI 只发送 Pi 标准请求，backend 在服务端解析真实模型地址和 API Key 后流式转发。
 */
@Service
public class GitPilotModelProxyService {

    private final GitPilotCliService cliService;
    private final ModelConfigService modelConfigService;
    private final GitPilotCliProperties properties;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    public GitPilotModelProxyService(GitPilotCliService cliService,
                                     ModelConfigService modelConfigService,
                                     GitPilotCliProperties properties,
                                     ObjectMapper objectMapper) {
        this.cliService = cliService;
        this.modelConfigService = modelConfigService;
        this.properties = properties;
        this.objectMapper = objectMapper;
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
            HttpResponse<InputStream> upstream = httpClient.send(
                    builder.POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(payload), StandardCharsets.UTF_8)).build(),
                    HttpResponse.BodyHandlers.ofInputStream()
            );
            servletResponse.setStatus(upstream.statusCode());
            servletResponse.setCharacterEncoding(StandardCharsets.UTF_8.name());
            servletResponse.setContentType(upstream.headers().firstValue("content-type").orElse("text/event-stream; charset=utf-8"));
            servletResponse.setHeader("cache-control", "no-cache, no-transform");
            try (InputStream input = upstream.body()) {
                input.transferTo(servletResponse.getOutputStream());
            }
        } catch (IOException exception) {
            throw new IllegalStateException("模型平台代理请求失败", exception);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("模型平台代理请求被中断", exception);
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
