package com.aiclub.platform.service;

import com.aiclub.platform.dto.AssistantMcpToolSummary;
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
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 验证外部 MCP Streamable HTTP 握手、工具发现和工具调用协议。 */
class ExternalMcpClientTests {

    private HttpServer server;
    private final AtomicInteger toolCallCount = new AtomicInteger();
    private boolean failToolCall;

    @AfterEach
    void tearDown() {
        if (server != null) server.stop(0);
    }

    /** 发现目录应保留工具 Schema，并把未明确只读的工具标记为需确认。 */
    @Test
    void shouldDiscoverToolsAndMarkUnknownToolsAsConfirmationRequired() throws Exception {
        ObjectMapper objectMapper = new ObjectMapper();
        startServer(objectMapper);
        ExternalMcpClient client = new ExternalMcpClient(objectMapper, 1000, 5000, "localhost");

        ExternalMcpClient.DiscoveryResult result = client.discover(
                "http://localhost:" + server.getAddress().getPort() + "/mcp", "AUTO", "NONE", "");

        assertThat(result.serverName()).isEqualTo("mock-mcp");
        assertThat(result.tools()).hasSize(2);
        assertThat(result.tools()).extracting(AssistantMcpToolSummary::name)
                .containsExactly("search", "update");
        assertThat(result.tools().get(0).readOnly()).isTrue();
        assertThat(result.tools().get(1).requiresConfirm()).isTrue();
    }

    /** 工具调用应发送标准 tools/call 请求并返回 content 文本。 */
    @Test
    void shouldCallExternalTool() throws Exception {
        ObjectMapper objectMapper = new ObjectMapper();
        startServer(objectMapper);
        ExternalMcpClient client = new ExternalMcpClient(objectMapper, 1000, 5000, "localhost");

        String result = client.call("http://localhost:" + server.getAddress().getPort() + "/mcp",
                "AUTO", "BEARER", "token", "search", Map.of("keyword", "GitPilot"));

        assertThat(result).isEqualTo("查询结果");
    }

    /** 工具调用失败后不得切换传输协议重试，避免远端写工具被重复执行。 */
    @Test
    void shouldNotRetryToolCallAfterTheHandshakeSucceeded() throws Exception {
        ObjectMapper objectMapper = new ObjectMapper();
        failToolCall = true;
        startServer(objectMapper);
        ExternalMcpClient client = new ExternalMcpClient(objectMapper, 1000, 5000, "localhost");

        assertThatThrownBy(() -> client.call("http://localhost:" + server.getAddress().getPort() + "/mcp",
                "AUTO", "NONE", "", "update", Map.of()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("HTTP 500");
        assertThat(toolCallCount).hasValue(1);
    }

    private void startServer(ObjectMapper objectMapper) throws IOException {
        server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/mcp", exchange -> handle(exchange, objectMapper));
        server.start();
    }

    private void handle(HttpExchange exchange, ObjectMapper objectMapper) throws IOException {
        JsonNode request = objectMapper.readTree(exchange.getRequestBody().readAllBytes());
        String method = request.path("method").asText("");
        String body;
        if ("initialize".equals(method)) {
            body = "{\"jsonrpc\":\"2.0\",\"id\":1,\"result\":{\"protocolVersion\":\"2025-03-26\",\"serverInfo\":{\"name\":\"mock-mcp\",\"version\":\"1.0\"}}}";
        } else if ("tools/list".equals(method)) {
            body = "{\"jsonrpc\":\"2.0\",\"id\":2,\"result\":{\"tools\":[{\"name\":\"search\",\"description\":\"搜索\",\"inputSchema\":{\"type\":\"object\"},\"annotations\":{\"readOnlyHint\":true}},{\"name\":\"update\",\"description\":\"更新\",\"inputSchema\":{\"type\":\"object\"}}]}}";
        } else if ("tools/call".equals(method)) {
            toolCallCount.incrementAndGet();
            if (failToolCall) {
                exchange.sendResponseHeaders(500, -1);
                exchange.close();
                return;
            }
            body = "{\"jsonrpc\":\"2.0\",\"id\":3,\"result\":{\"content\":[{\"type\":\"text\",\"text\":\"查询结果\"}]}}";
        } else {
            body = "{}";
        }
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.getResponseHeaders().add("Mcp-Session-Id", "mock-session");
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.sendResponseHeaders(200, bytes.length);
        try (OutputStream output = exchange.getResponseBody()) { output.write(bytes); }
    }
}
