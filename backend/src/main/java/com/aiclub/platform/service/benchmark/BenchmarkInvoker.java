package com.aiclub.platform.service.benchmark;

import com.aiclub.platform.service.ModelConfigService;
import com.aiclub.platform.service.ModelConfigService.ResolvedModelConfig;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

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

/**
 * 模型对比测试的单次调用执行器：
 * - 支持 OpenAI（含 OpenAI 兼容）与 Anthropic
 * - 流式开启时按行读取 SSE，记录"首 token"耗时（TTFT）和总耗时，并优先从 usage 取 token 数
 * - 流式未开启或失败时回退到一次性请求，TTFT 退化为总耗时
 *
 * 注意：本类不复用 ModelConfigService 中的 sendJsonPost，
 * 因为 SSE 需要持有 InputStream 才能精确测量首 token 时间。
 */
@Component
public class BenchmarkInvoker {

    private static final Logger log = LoggerFactory.getLogger(BenchmarkInvoker.class);

    /** 单次请求超时 90s，防止极端慢的模型阻塞线程过久。 */
    private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(90);

    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    public BenchmarkInvoker(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .build();
    }

    /**
     * 执行一次压测请求。任何异常都会被捕获并归入失败结果，避免线程池被异常打断。
     */
    public BenchmarkInvocationResult invoke(ResolvedModelConfig config,
                                            String systemPrompt,
                                            String userPrompt,
                                            int maxTokens,
                                            boolean stream) {
        long startNs = System.nanoTime();
        try {
            String provider = config.provider() == null ? "" : config.provider().trim().toUpperCase();
            if (ModelConfigService.PROVIDER_OPENAI.equals(provider)) {
                return invokeOpenAi(config, systemPrompt, userPrompt, maxTokens, stream, startNs);
            }
            if (ModelConfigService.PROVIDER_ANTHROPIC.equals(provider)) {
                return invokeAnthropic(config, systemPrompt, userPrompt, maxTokens, stream, startNs);
            }
            return BenchmarkInvocationResult.failure(elapsedMs(startNs), "不支持的提供商：" + provider);
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
            return BenchmarkInvocationResult.failure(elapsedMs(startNs), "请求被中断");
        } catch (Exception ex) {
            return BenchmarkInvocationResult.failure(elapsedMs(startNs), trimError(ex.getMessage()));
        }
    }

    // ============ OpenAI ============

    private BenchmarkInvocationResult invokeOpenAi(ResolvedModelConfig config,
                                                   String systemPrompt,
                                                   String userPrompt,
                                                   int maxTokens,
                                                   boolean stream,
                                                   long startNs) throws IOException, InterruptedException {
        String baseUrl = trimSlash(config.apiBaseUrl());
        // benchmark 始终走 chat/completions，行为最稳定且 stream_options.include_usage 兼容性好
        String url = baseUrl + "/chat/completions";
        ObjectNode payload = objectMapper.createObjectNode()
                .put("model", config.modelName())
                .put("temperature", 0)
                .put("max_tokens", maxTokens);
        ArrayNode messages = payload.putArray("messages");
        if (hasText(systemPrompt)) {
            messages.add(objectMapper.createObjectNode().put("role", "system").put("content", systemPrompt));
        }
        messages.add(objectMapper.createObjectNode().put("role", "user").put("content", defaultString(userPrompt)));

        if (stream) {
            payload.put("stream", true);
            payload.set("stream_options", objectMapper.createObjectNode().put("include_usage", true));
            return doStreamRequest(url, config.apiKey(), false, payload, startNs);
        }

        HttpRequest request = jsonPostBuilder(url, config.apiKey(), false)
                .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(payload), StandardCharsets.UTF_8))
                .build();
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        long totalMs = elapsedMs(startNs);
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            return BenchmarkInvocationResult.failure(totalMs, "HTTP " + response.statusCode() + ": " + trimError(response.body()));
        }
        JsonNode body = objectMapper.readTree(response.body());
        String content = body.path("choices").path(0).path("message").path("content").asText("");
        int inputTokens = body.path("usage").path("prompt_tokens").asInt(0);
        int outputTokens = body.path("usage").path("completion_tokens").asInt(0);
        boolean fromUsage = inputTokens > 0 || outputTokens > 0;
        if (!fromUsage) {
            outputTokens = estimateTokens(content);
            inputTokens = estimateTokens(systemPrompt) + estimateTokens(userPrompt);
        }
        return BenchmarkInvocationResult.success(totalMs, totalMs, inputTokens, outputTokens, fromUsage, sampleOutput(content));
    }

    // ============ Anthropic ============

    private BenchmarkInvocationResult invokeAnthropic(ResolvedModelConfig config,
                                                     String systemPrompt,
                                                     String userPrompt,
                                                     int maxTokens,
                                                     boolean stream,
                                                     long startNs) throws IOException, InterruptedException {
        String url = trimSlash(config.apiBaseUrl()) + "/messages";
        ObjectNode payload = objectMapper.createObjectNode()
                .put("model", config.modelName())
                .put("max_tokens", maxTokens)
                .put("temperature", 0);
        if (hasText(systemPrompt)) {
            payload.put("system", systemPrompt);
        }
        ArrayNode messages = payload.putArray("messages");
        messages.add(objectMapper.createObjectNode().put("role", "user").put("content", defaultString(userPrompt)));

        if (stream) {
            payload.put("stream", true);
            return doStreamRequest(url, config.apiKey(), true, payload, startNs);
        }

        HttpRequest request = jsonPostBuilder(url, config.apiKey(), true)
                .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(payload), StandardCharsets.UTF_8))
                .build();
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        long totalMs = elapsedMs(startNs);
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            return BenchmarkInvocationResult.failure(totalMs, "HTTP " + response.statusCode() + ": " + trimError(response.body()));
        }
        JsonNode body = objectMapper.readTree(response.body());
        StringBuilder text = new StringBuilder();
        for (JsonNode node : body.path("content")) {
            if ("text".equals(node.path("type").asText())) {
                text.append(node.path("text").asText(""));
            }
        }
        int inputTokens = body.path("usage").path("input_tokens").asInt(0);
        int outputTokens = body.path("usage").path("output_tokens").asInt(0);
        boolean fromUsage = inputTokens > 0 || outputTokens > 0;
        if (!fromUsage) {
            outputTokens = estimateTokens(text.toString());
            inputTokens = estimateTokens(systemPrompt) + estimateTokens(userPrompt);
        }
        return BenchmarkInvocationResult.success(totalMs, totalMs, inputTokens, outputTokens, fromUsage, sampleOutput(text.toString()));
    }

    // ============ 流式 SSE 通用读取 ============

    /**
     * 通用 SSE 读取：逐行解析 `data: {...}`，第一次拿到非空 delta 时记 TTFT。
     * 兼容 OpenAI chat/completions 与 Anthropic messages 两种事件流。
     */
    private BenchmarkInvocationResult doStreamRequest(String url,
                                                     String apiKey,
                                                     boolean anthropic,
                                                     ObjectNode payload,
                                                     long startNs) throws IOException, InterruptedException {
        HttpRequest request = jsonPostBuilder(url, apiKey, anthropic)
                .header("Accept", "text/event-stream")
                .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(payload), StandardCharsets.UTF_8))
                .build();

        HttpResponse<InputStream> response = httpClient.send(request, HttpResponse.BodyHandlers.ofInputStream());
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            String body;
            try (InputStream in = response.body()) {
                body = new String(in.readAllBytes(), StandardCharsets.UTF_8);
            }
            return BenchmarkInvocationResult.failure(elapsedMs(startNs), "HTTP " + response.statusCode() + ": " + trimError(body));
        }

        long ttftNs = -1L;
        StringBuilder content = new StringBuilder();
        int inputTokens = 0;
        int outputTokens = 0;
        boolean fromUsage = false;

        try (BufferedReader reader = new BufferedReader(new InputStreamReader(response.body(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.isEmpty()) {
                    continue;
                }
                if (!line.startsWith("data:")) {
                    // Anthropic 也有 `event: ...` 行，忽略
                    continue;
                }
                String dataPart = line.substring(5).trim();
                if (dataPart.isEmpty() || "[DONE]".equals(dataPart)) {
                    continue;
                }
                JsonNode event;
                try {
                    event = objectMapper.readTree(dataPart);
                } catch (Exception ignore) {
                    continue;
                }

                String delta = anthropic ? extractAnthropicDelta(event) : extractOpenAiDelta(event);
                if (hasText(delta)) {
                    if (ttftNs < 0) {
                        ttftNs = System.nanoTime();
                    }
                    content.append(delta);
                }

                // OpenAI: 流末尾的 chunk 会带 usage（开启 include_usage 的情况下）
                JsonNode usage = anthropic
                        ? event.path("usage")               // message_delta / message_start 都可能携带
                        : event.path("usage");
                if (usage.isObject()) {
                    if (anthropic) {
                        if (usage.has("input_tokens")) {
                            inputTokens = Math.max(inputTokens, usage.get("input_tokens").asInt(0));
                        }
                        if (usage.has("output_tokens")) {
                            outputTokens = Math.max(outputTokens, usage.get("output_tokens").asInt(0));
                        }
                    } else {
                        int promptTokens = usage.path("prompt_tokens").asInt(0);
                        int completionTokens = usage.path("completion_tokens").asInt(0);
                        if (promptTokens > 0) {
                            inputTokens = promptTokens;
                        }
                        if (completionTokens > 0) {
                            outputTokens = completionTokens;
                        }
                    }
                    if (inputTokens > 0 || outputTokens > 0) {
                        fromUsage = true;
                    }
                }
            }
        }

        long totalMs = elapsedMs(startNs);
        long ttftMs = ttftNs > 0 ? Math.max(0L, (ttftNs - startNs) / 1_000_000L) : totalMs;

        if (!fromUsage) {
            outputTokens = estimateTokens(content.toString());
        }
        if (content.length() == 0 && !fromUsage) {
            return BenchmarkInvocationResult.failure(totalMs, "流式响应未返回任何内容");
        }
        return BenchmarkInvocationResult.success(ttftMs, totalMs, inputTokens, outputTokens, fromUsage, sampleOutput(content.toString()));
    }

    private String extractOpenAiDelta(JsonNode event) {
        JsonNode choices = event.path("choices");
        if (!choices.isArray() || choices.isEmpty()) {
            return "";
        }
        JsonNode first = choices.get(0);
        // chat/completions 流式
        String delta = first.path("delta").path("content").asText("");
        if (hasText(delta)) {
            return delta;
        }
        // 非流式 fallback：极少数兼容服务即使 stream=true 也直接给完整 message
        return first.path("message").path("content").asText("");
    }

    private String extractAnthropicDelta(JsonNode event) {
        String type = event.path("type").asText("");
        if ("content_block_delta".equals(type)) {
            return event.path("delta").path("text").asText("");
        }
        return "";
    }

    // ============ 工具方法 ============

    private HttpRequest.Builder jsonPostBuilder(String url, String apiKey, boolean anthropic) {
        HttpRequest.Builder builder = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .timeout(REQUEST_TIMEOUT)
                .header("Content-Type", "application/json");
        if (anthropic) {
            builder.header("x-api-key", apiKey);
            builder.header("anthropic-version", "2023-06-01");
        } else {
            builder.header("Authorization", "Bearer " + apiKey);
        }
        return builder;
    }

    private long elapsedMs(long startNs) {
        return Math.max(0L, (System.nanoTime() - startNs) / 1_000_000L);
    }

    /** 兜底估算：按 4 字符 ≈ 1 token，避免外部接口未返回 usage 时彻底失真。 */
    static int estimateTokens(String text) {
        if (text == null || text.isEmpty()) {
            return 0;
        }
        return Math.max(1, text.length() / 4);
    }

    private static String trimSlash(String value) {
        String result = value == null ? "" : value.trim();
        while (result.endsWith("/")) {
            result = result.substring(0, result.length() - 1);
        }
        return result;
    }

    private static boolean hasText(String value) {
        return value != null && !value.isEmpty();
    }

    private static String defaultString(String value) {
        return value == null ? "" : value;
    }

    private static String trimError(String message) {
        if (message == null || message.isEmpty()) {
            return "未知错误";
        }
        String value = message.trim();
        return value.length() > 500 ? value.substring(0, 500) : value;
    }

    private static String sampleOutput(String value) {
        if (value == null || value.isEmpty()) {
            return "";
        }
        return value.length() > 200 ? value.substring(0, 200) : value;
    }

    /** 给 Service 单测使用的极简日志，避免误打印 apiKey。 */
    void debugLog(String message) {
        log.debug(message);
    }
}
