package com.aiclub.platform.service;

import com.aiclub.platform.dto.HermesConversationTurn;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 锁定 Hermes 网关最终发包内容，避免 PromptBuilder 产出的 userPrompt 再次被静默丢掉。
 */
class HermesGatewayServiceTests {

    private HttpServer server;
    private final AtomicReference<String> lastRequestBody = new AtomicReference<>("");

    @AfterEach
    void tearDown() {
        if (server != null) {
            server.stop(0);
        }
    }

    @Test
    void shouldAppendPromptUserMessageAfterTranscript() throws Exception {
        HermesGatewayService service = createService();

        HermesPromptBuilder.HermesPrompt prompt = new HermesPromptBuilder.HermesPrompt(
                "system prompt",
                "current contextual user prompt"
        );

        HermesGatewayService.HermesGatewayResult result = service.createChatCompletion(
                prompt,
                List.of(
                        HermesConversationTurn.user("历史问题"),
                        HermesConversationTurn.assistant("历史回答")
                )
        );

        assertThat(result.responseId()).isEqualTo("resp-1");

        JsonNode root = new ObjectMapper().readTree(lastRequestBody.get());
        JsonNode messages = root.path("messages");
        assertThat(messages).hasSize(4);
        assertThat(messages.get(0).path("role").asText()).isEqualTo("system");
        assertThat(messages.get(0).path("content").asText()).isEqualTo("system prompt");
        assertThat(messages.get(1).path("content").asText()).isEqualTo("历史问题");
        assertThat(messages.get(2).path("content").asText()).isEqualTo("历史回答");
        assertThat(messages.get(3).path("role").asText()).isEqualTo("user");
        assertThat(messages.get(3).path("content").asText()).isEqualTo("current contextual user prompt");
    }

    @Test
    void shouldWrapStreamReasoningContentAsThinkBlock() throws Exception {
        HermesGatewayService service = createService();
        List<String> deltas = new ArrayList<>();

        HermesGatewayService.HermesGatewayResult result = service.streamChatCompletion(
                new HermesPromptBuilder.HermesPrompt("system prompt", "current user prompt"),
                List.of(),
                deltas::add
        );

        assertThat(result.responseId()).isEqualTo("stream-1");
        assertThat(result.content()).isEqualTo("<think>先分析项目状态，再查找延期风险。</think>当前项目存在延期风险。");
        assertThat(deltas).containsExactly(
                "<think>先分析项目状态，",
                "再查找延期风险。",
                "</think>当前项目存在延期风险。"
        );
    }

    private HermesGatewayService createService() throws Exception {
        server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/v1/chat/completions", this::handleRequest);
        server.start();
        return new HermesGatewayService(
                new HermesProperties("http://localhost:" + server.getAddress().getPort() + "/v1", "", "hermes-agent", 60, "test:hermes", 6, 86400),
                new ObjectMapper()
        );
    }

    private void handleRequest(HttpExchange exchange) throws IOException {
        lastRequestBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
        JsonNode requestRoot = new ObjectMapper().readTree(lastRequestBody.get());
        if (requestRoot.path("stream").asBoolean(false)) {
            handleStreamRequest(exchange);
            return;
        }
        String body = """
                {
                  "id": "resp-1",
                  "choices": [
                    {
                      "message": {
                        "content": "ok"
                      }
                    }
                  ]
                }
                """;
        byte[] responseBody = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(200, responseBody.length);
        try (OutputStream outputStream = exchange.getResponseBody()) {
            outputStream.write(responseBody);
        }
    }

    private void handleStreamRequest(HttpExchange exchange) throws IOException {
        String body = """
                data: {"id":"stream-1","choices":[{"delta":{"reasoning_content":"先分析项目状态，"}}]}

                data: {"id":"stream-1","choices":[{"delta":{"reasoning_content":"再查找延期风险。"}}]}

                data: {"id":"stream-1","choices":[{"delta":{"content":"当前项目存在延期风险。"}}]}

                data: [DONE]

                """;
        byte[] responseBody = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "text/event-stream; charset=utf-8");
        exchange.sendResponseHeaders(200, responseBody.length);
        try (OutputStream outputStream = exchange.getResponseBody()) {
            outputStream.write(responseBody);
        }
    }
}
