package com.aiclub.platform.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Service;

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
 * 负责将平台内部请求桥接到 Hermes OpenAI 兼容接口，并把远端流式事件转换为平台内部事件。
 */
@Service
public class HermesGatewayService {

    private final HermesProperties hermesProperties;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    public HermesGatewayService(HermesProperties hermesProperties, ObjectMapper objectMapper) {
        this.hermesProperties = hermesProperties;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .version(HttpClient.Version.HTTP_1_1)
                .build();
    }

    /**
     * 以流式方式调用 Hermes，并把文本增量回调给上层服务。
     */
    public HermesGatewayResult streamChat(String scopeKey,
                                          HermesPromptBuilder.HermesPrompt prompt,
                                          HermesDeltaConsumer consumer) {
        try {
            HttpResponse<InputStream> responsesResponse = sendResponsesStream(scopeKey, prompt);
            if (responsesResponse.statusCode() == 404) {
                return streamViaChatCompletions(prompt, consumer);
            }
            if (responsesResponse.statusCode() < 200 || responsesResponse.statusCode() >= 300) {
                throw new IllegalStateException("Hermes Responses 接口调用失败：" + readErrorBody(responsesResponse));
            }
            try (InputStream body = responsesResponse.body()) {
                return consumeResponsesStream(body, consumer);
            }
        } catch (IOException | InterruptedException exception) {
            if (exception instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            throw new IllegalStateException("Hermes 网关流式调用失败：" + limitMessage(exception.getMessage()), exception);
        }
    }

    /**
     * 强制走 Chat Completions 原生流式协议，确保上游 token 级增量能完整传递给平台。
     */
    public HermesGatewayResult streamChatCompletions(HermesPromptBuilder.HermesPrompt prompt,
                                                     HermesDeltaConsumer consumer) {
        try {
            return streamViaChatCompletions(prompt, consumer);
        } catch (IOException | InterruptedException exception) {
            if (exception instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            throw new IllegalStateException("Hermes Chat Completions 流式调用失败：" + limitMessage(exception.getMessage()), exception);
        }
    }

    /**
     * 优先使用 Responses API 保持 Hermes 端会话状态，并通过 conversation 绑定平台 scopeKey。
     */
    private HttpResponse<InputStream> sendResponsesStream(String scopeKey,
                                                          HermesPromptBuilder.HermesPrompt prompt) throws IOException, InterruptedException {
        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("model", hermesProperties.getModel());
        payload.put("conversation", scopeKey);
        payload.put("stream", true);
        payload.put("instructions", prompt.systemPrompt());
        payload.put("input", prompt.userPrompt());
        return sendStreamRequest(hermesProperties.getBaseUrl() + "/responses", payload);
    }

    /**
     * 当 Hermes 网关未暴露 Responses API 时，回退到更常见的 Chat Completions 流式协议。
     */
    private HermesGatewayResult streamViaChatCompletions(HermesPromptBuilder.HermesPrompt prompt,
                                                         HermesDeltaConsumer consumer) throws IOException, InterruptedException {
        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("model", hermesProperties.getModel());
        payload.put("stream", true);
        ArrayNode messages = payload.putArray("messages");
        messages.addObject()
                .put("role", "system")
                .put("content", prompt.systemPrompt());
        messages.addObject()
                .put("role", "user")
                .put("content", prompt.userPrompt());
        HttpResponse<InputStream> response = sendStreamRequest(hermesProperties.getBaseUrl() + "/chat/completions", payload);
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IllegalStateException("Hermes Chat Completions 接口调用失败：" + readErrorBody(response));
        }
        try (InputStream body = response.body()) {
            return consumeChatCompletionsStream(body, consumer);
        }
    }

    private HttpResponse<InputStream> sendStreamRequest(String url, JsonNode payload) throws IOException, InterruptedException {
        HttpRequest.Builder builder = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .timeout(Duration.ofSeconds(hermesProperties.getTimeoutSeconds()))
                .header("Accept", "text/event-stream")
                .header("Content-Type", "application/json");
        if (!hermesProperties.getApiKey().isBlank()) {
            builder.header("Authorization", "Bearer " + hermesProperties.getApiKey());
        }
        return httpClient.send(
                builder.POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(payload), StandardCharsets.UTF_8)).build(),
                HttpResponse.BodyHandlers.ofInputStream()
        );
    }

    /**
     * 解析 Responses API 的 SSE 事件，优先识别 output_text 增量，再在完成事件中提取最终响应标识。
     */
    private HermesGatewayResult consumeResponsesStream(InputStream inputStream,
                                                       HermesDeltaConsumer consumer) throws IOException {
        String responseBody = new String(inputStream.readAllBytes(), StandardCharsets.UTF_8);
        if (responseBody.isBlank()) {
            return new HermesGatewayResult(null, "");
        }

        String normalizedBody = responseBody.replace("\r", "");
        if (normalizedBody.trim().startsWith("{")) {
            JsonNode responseNode = objectMapper.readTree(normalizedBody);
            String responseId = responseNode.path("id").isTextual() ? responseNode.path("id").asText() : null;
            String content = extractResponsesOutputText(responseNode);
            String normalizedContent = content != null && !content.isBlank() ? content : normalizedBody;
            emitChunkedDelta(normalizedContent, consumer);
            return new HermesGatewayResult(responseId, normalizedContent);
        }

        StringBuilder fullText = new StringBuilder();
        StringBuilder eventData = new StringBuilder();
        String eventName = "";
        String responseId = null;
        String completedText = null;
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(
                new java.io.ByteArrayInputStream(normalizedBody.getBytes(StandardCharsets.UTF_8)),
                StandardCharsets.UTF_8
        ))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.isEmpty()) {
                    HermesEventParseResult parseResult = processResponsesEvent(eventName, eventData.toString(), consumer, fullText);
                    if (parseResult.responseId() != null) {
                        responseId = parseResult.responseId();
                    }
                    if (parseResult.completedText() != null) {
                        completedText = parseResult.completedText();
                    }
                    eventName = "";
                    eventData.setLength(0);
                    continue;
                }
                if (line.startsWith("event:")) {
                    eventName = line.substring("event:".length()).trim();
                    continue;
                }
                if (line.startsWith("data:")) {
                    if (eventData.length() > 0) {
                        eventData.append('\n');
                    }
                    eventData.append(line.substring("data:".length()).trim());
                }
            }
        }
        String content = completedText != null && !completedText.isBlank() ? completedText : fullText.toString();
        return new HermesGatewayResult(responseId, content);
    }

    /**
     * 解析 Chat Completions SSE 事件，兼容 choices[0].delta.content 形态。
     */
    private HermesGatewayResult consumeChatCompletionsStream(InputStream inputStream,
                                                             HermesDeltaConsumer consumer) throws IOException {
        StringBuilder fullText = new StringBuilder();
        StringBuilder eventData = new StringBuilder();
        String responseId = null;
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(inputStream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.isEmpty()) {
                    String data = eventData.toString();
                    if (!data.isBlank() && !"[DONE]".equals(data)) {
                        JsonNode node = objectMapper.readTree(data);
                        if (node.path("id").isTextual()) {
                            responseId = node.path("id").asText();
                        }
                        JsonNode choices = node.path("choices");
                        if (choices.isArray() && !choices.isEmpty()) {
                            String delta = choices.get(0).path("delta").path("content").asText("");
                            if (!delta.isBlank()) {
                                fullText.append(delta);
                                consumer.onDelta(delta);
                            }
                        }
                    }
                    eventData.setLength(0);
                    continue;
                }
                if (line.startsWith("data:")) {
                    if (eventData.length() > 0) {
                        eventData.append('\n');
                    }
                    eventData.append(line.substring("data:".length()).trim());
                }
            }
        }
        return new HermesGatewayResult(responseId, fullText.toString());
    }

    private HermesEventParseResult processResponsesEvent(String eventName,
                                                         String eventData,
                                                         HermesDeltaConsumer consumer,
                                                         StringBuilder fullText) throws IOException {
        if (eventData == null || eventData.isBlank() || "[DONE]".equals(eventData)) {
            return HermesEventParseResult.empty();
        }
        JsonNode node = objectMapper.readTree(eventData);
        String type = node.path("type").asText(eventName);
        if (type.contains("error") || node.hasNonNull("error")) {
            throw new IllegalStateException(resolveErrorMessage(node));
        }

        String delta = "";
        if (type.contains("output_text.delta")) {
            delta = node.path("delta").asText("");
        } else if (node.path("choices").isArray() && !node.path("choices").isEmpty()) {
            delta = node.path("choices").get(0).path("delta").path("content").asText("");
        }
        if (!delta.isBlank()) {
            fullText.append(delta);
            consumer.onDelta(delta);
        }

        String responseId = null;
        String completedText = null;
        if (type.contains("completed") || type.contains("done")) {
            JsonNode responseNode = node.path("response");
            if (responseNode.path("id").isTextual()) {
                responseId = responseNode.path("id").asText();
            }
            completedText = extractResponsesOutputText(responseNode);
        }
        return new HermesEventParseResult(responseId, completedText);
    }

    private String extractResponsesOutputText(JsonNode responseNode) {
        if (responseNode == null || responseNode.isMissingNode() || responseNode.isNull()) {
            return null;
        }
        if (responseNode.path("output_text").isTextual() && !responseNode.path("output_text").asText().isBlank()) {
            return responseNode.path("output_text").asText();
        }
        for (JsonNode output : responseNode.path("output")) {
            for (JsonNode content : output.path("content")) {
                String type = content.path("type").asText();
                if (("output_text".equals(type) || "text".equals(type)) && content.path("text").isTextual()) {
                    String text = content.path("text").asText();
                    if (!text.isBlank()) {
                        return text;
                    }
                }
            }
        }
        return null;
    }

    private String resolveErrorMessage(JsonNode node) {
        if (node.path("error").path("message").isTextual()) {
            return node.path("error").path("message").asText();
        }
        if (node.path("message").isTextual()) {
            return node.path("message").asText();
        }
        return "Hermes 远端服务返回了错误";
    }

    private String readErrorBody(HttpResponse<InputStream> response) throws IOException {
        try (InputStream body = response.body()) {
            String content = new String(body.readAllBytes(), StandardCharsets.UTF_8);
            if (content.isBlank()) {
                return "HTTP " + response.statusCode();
            }
            return limitMessage(content);
        }
    }

    private String limitMessage(String value) {
        if (value == null || value.isBlank()) {
            return "未知错误";
        }
        String normalized = value.trim();
        return normalized.length() > 500 ? normalized.substring(0, 500) : normalized;
    }

    /**
     * 当上游网关一次性返回完整文本而非原生 SSE 时，后端主动切片为多个 delta，给前端稳定流式体验。
     */
    private void emitChunkedDelta(String content, HermesDeltaConsumer consumer) {
        if (content == null || content.isBlank()) {
            return;
        }
        int chunkSize = content.length() > 800 ? 24 : content.length() > 300 ? 16 : 8;
        int cursor = 0;
        while (cursor < content.length()) {
            int nextCursor = Math.min(content.length(), cursor + chunkSize);
            consumer.onDelta(content.substring(cursor, nextCursor));
            cursor = nextCursor;
        }
    }

    /**
     * Hermes 输出文本的增量消费回调。
     */
    public interface HermesDeltaConsumer {
        /**
         * 接收 Hermes 新生成的一段文本。
         */
        void onDelta(String deltaText);
    }

    /**
     * Hermes 流式调用结束后的关键信息。
     */
    public record HermesGatewayResult(String responseId, String content) {
    }

    private record HermesEventParseResult(String responseId, String completedText) {
        private static HermesEventParseResult empty() {
            return new HermesEventParseResult(null, null);
        }
    }
}
