package com.aiclub.platform.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;

import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 执行工作区清理客户端需要锁定 backend 与 code-processing 的 HTTP 契约，
 * 避免路径、鉴权头或 payload 字段漂移后直到联调阶段才暴露问题。
 */
class ExecutionWorkspaceCleanupClientServiceTests {

    /**
     * 删除客户端必须命中既定内部路径，并发送 workspaceRoot 字段和内部服务认证头。
     */
    @Test
    void shouldPostWorkspaceCleanupRequestWithAuthorizationHeader() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
        StringBuilder capturedAuthorization = new StringBuilder();
        StringBuilder capturedPath = new StringBuilder();
        StringBuilder capturedBody = new StringBuilder();
        server.createContext("/api/execution-workspaces/cleanup", exchange -> {
            capturedAuthorization.append(exchange.getRequestHeaders().getFirst("Authorization"));
            capturedPath.append(exchange.getRequestURI().getPath());
            capturedBody.append(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            exchange.sendResponseHeaders(204, -1);
            exchange.close();
        });
        server.start();
        try {
            InternalServiceAuthenticator authenticator = mock(InternalServiceAuthenticator.class);
            when(authenticator.authorizationHeaderValue()).thenReturn("Bearer internal-token");
            ExecutionWorkspaceCleanupClientService clientService = new ExecutionWorkspaceCleanupClientService(
                    new ObjectMapper(),
                    authenticator,
                    "http://127.0.0.1:" + server.getAddress().getPort() + "/",
                    HttpClient.newHttpClient()
            );

            clientService.cleanupWorkspace("C:/workspace/task-99/run-301/repo-demo");

            JsonNode payload = new ObjectMapper().readTree(capturedBody.toString());
            assertThat(capturedPath.toString()).isEqualTo("/api/execution-workspaces/cleanup");
            assertThat(capturedAuthorization.toString()).isEqualTo("Bearer internal-token");
            assertThat(payload.path("workspaceRoot").asText()).isEqualTo("C:/workspace/task-99/run-301/repo-demo");
        } finally {
            server.stop(0);
        }
    }

    /**
     * 非 2xx 响应要把 detail 原样翻译进错误消息，
     * 这样 backend 才能把 code-processing 的失败原因准确落库。
     */
    @Test
    void shouldSurfaceDetailMessageWhenCleanupEndpointReturnsError() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/api/execution-workspaces/cleanup", exchange -> {
            byte[] responseBytes = "{\"detail\":\"endpoint missing\"}".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(404, responseBytes.length);
            try (OutputStream outputStream = exchange.getResponseBody()) {
                outputStream.write(responseBytes);
            }
        });
        server.start();
        try {
            InternalServiceAuthenticator authenticator = mock(InternalServiceAuthenticator.class);
            when(authenticator.authorizationHeaderValue()).thenReturn("Bearer internal-token");
            ExecutionWorkspaceCleanupClientService clientService = new ExecutionWorkspaceCleanupClientService(
                    new ObjectMapper(),
                    authenticator,
                    "http://127.0.0.1:" + server.getAddress().getPort(),
                    HttpClient.newHttpClient()
            );

            assertThatThrownBy(() -> clientService.cleanupWorkspace("C:/workspace/task-99/run-301/repo-demo"))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("HTTP 404")
                    .hasMessageContaining("endpoint missing");
        } finally {
            server.stop(0);
        }
    }
}
