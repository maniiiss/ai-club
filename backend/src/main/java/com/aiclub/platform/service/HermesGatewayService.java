package com.aiclub.platform.service;

import com.aiclub.platform.dto.HermesConversationTurn;
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
import java.util.List;

/**
 * 负责把平台内部的会话请求代理到 Hermes API Server。
 * 新版仅使用 Chat Completions，并把工具调用完全交给 Hermes 自己的 MCP 运行时。
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
     * 以非流式方式调用 Hermes Chat Completions。
     */
    public HermesGatewayResult createChatCompletion(HermesPromptBuilder.HermesPrompt prompt,
                                                    List<HermesConversationTurn> transcript) {
        try {
            ObjectNode payload = buildChatPayload(prompt, transcript, false);
            HttpResponse<String> response = sendJsonRequest(hermesProperties.getBaseUrl() + "/chat/completions", payload);
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new IllegalStateException("Hermes Chat Completions 接口调用失败：" + limitMessage(response.body()));
            }
            JsonNode root = objectMapper.readTree(response.body());
            JsonNode choices = root.path("choices");
            if (!choices.isArray() || choices.isEmpty()) {
                throw new IllegalStateException("Hermes 未返回有效回答");
            }
            JsonNode messageNode = choices.get(0).path("message");
            return new HermesGatewayResult(
                    root.path("id").asText(""),
                    extractMessageContent(messageNode.path("content"))
            );
        } catch (IOException | InterruptedException exception) {
            if (exception instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            throw new IllegalStateException("Hermes 非流式会话调用失败：" + limitMessage(exception.getMessage()), exception);
        }
    }

    /**
     * 以流式方式调用 Hermes Chat Completions，并把文本增量回传给上层。
     */
    public HermesGatewayResult streamChatCompletion(HermesPromptBuilder.HermesPrompt prompt,
                                                    List<HermesConversationTurn> transcript,
                                                    HermesDeltaConsumer consumer) {
        try {
            ObjectNode payload = buildChatPayload(prompt, transcript, true);
            HttpResponse<InputStream> response = sendStreamRequest(hermesProperties.getBaseUrl() + "/chat/completions", payload);
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new IllegalStateException("Hermes Chat Completions 接口调用失败：" + readErrorBody(response));
            }
            try (InputStream body = response.body()) {
                return consumeChatCompletionsStream(body, consumer);
            }
        } catch (IOException | InterruptedException exception) {
            if (exception instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            throw new IllegalStateException("Hermes 流式会话调用失败：" + limitMessage(exception.getMessage()), exception);
        }
    }

    /**
     * 统一编码 Chat Completions 请求体。
     */
    private ObjectNode buildChatPayload(HermesPromptBuilder.HermesPrompt prompt,
                                        List<HermesConversationTurn> transcript,
                                        boolean stream) {
        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("model", hermesProperties.getModel());
        payload.put("stream", stream);
        ArrayNode messages = payload.putArray("messages");
        messages.addObject()
                .put("role", "system")
                .put("content", prompt.systemPrompt());
        if (transcript != null) {
            for (HermesConversationTurn turn : transcript) {
                if (turn == null || turn.role() == null || turn.role().isBlank()) {
                    continue;
                }
                messages.addObject()
                        .put("role", turn.role())
                        .put("content", turn.content() == null ? "" : turn.content());
            }
        }
        if (prompt != null && hasText(prompt.userPrompt())) {
            messages.addObject()
                    .put("role", "user")
                    .put("content", prompt.userPrompt());
        }
        return payload;
    }

    /**
     * 解析 Hermes 返回的 SSE 文本流。
     * 这里会原样消费 `choices[0].delta.content`，让前端直接看到 Hermes 内联的工具进度文本。
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
                            String deltaText = extractDeltaContent(choices.get(0).path("delta").path("content"));
                            if (!deltaText.isBlank()) {
                                fullText.append(deltaText);
                                if (consumer != null) {
                                    consumer.onDelta(deltaText);
                                }
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

    private String extractMessageContent(JsonNode contentNode) {
        if (contentNode == null || contentNode.isMissingNode() || contentNode.isNull()) {
            return "";
        }
        if (contentNode.isTextual()) {
            return contentNode.asText("");
        }
        if (!contentNode.isArray()) {
            return "";
        }
        StringBuilder builder = new StringBuilder();
        for (JsonNode item : contentNode) {
            String text = item.path("text").asText("");
            if (text.isBlank()) {
                text = item.path("content").asText("");
            }
            if (!text.isBlank()) {
                builder.append(text);
            }
        }
        return builder.toString();
    }

    private String extractDeltaContent(JsonNode deltaNode) {
        if (deltaNode == null || deltaNode.isMissingNode() || deltaNode.isNull()) {
            return "";
        }
        if (deltaNode.isTextual()) {
            return deltaNode.asText("");
        }
        if (!deltaNode.isArray()) {
            return "";
        }
        StringBuilder builder = new StringBuilder();
        for (JsonNode item : deltaNode) {
            String text = item.path("text").asText("");
            if (text.isBlank()) {
                text = item.path("content").asText("");
            }
            if (!text.isBlank()) {
                builder.append(text);
            }
        }
        return builder.toString();
    }

    private HttpResponse<String> sendJsonRequest(String url, JsonNode payload) throws IOException, InterruptedException {
        HttpRequest.Builder builder = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .timeout(Duration.ofSeconds(hermesProperties.getTimeoutSeconds()))
                .header("Content-Type", "application/json");
        if (!hermesProperties.getApiKey().isBlank()) {
            builder.header("Authorization", "Bearer " + hermesProperties.getApiKey());
        }
        return httpClient.send(
                builder.POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(payload), StandardCharsets.UTF_8)).build(),
                HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8)
        );
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

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    /**
     * Hermes 输出文本的增量回调。
     */
    public interface HermesDeltaConsumer {
        /**
         * 接收 Hermes 新生成的一段文本。
         */
        void onDelta(String deltaText);
    }

    /**
     * 一次 Chat Completions 调用的关键信息摘要。
     */
    public record HermesGatewayResult(String responseId, String content) {
    }
}
