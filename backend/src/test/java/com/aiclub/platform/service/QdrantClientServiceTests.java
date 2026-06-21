package com.aiclub.platform.service;

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
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 覆盖 Qdrant 客户端的建库、写入和检索协议，避免后续请求体字段拼错后才在线上发现。
 */
class QdrantClientServiceTests {

    private HttpServer server;
    private final AtomicReference<String> lastRequestBody = new AtomicReference<>("");
    private final AtomicReference<String> lastRequestPath = new AtomicReference<>("");
    private final AtomicInteger collectionCreateCount = new AtomicInteger();

    @AfterEach
    void tearDown() {
        if (server != null) {
            server.stop(0);
        }
    }

    @Test
    void shouldUpsertAndSearchPoints() throws Exception {
        QdrantClientService service = createService();

        service.createCollection("wiki_project_chunks", 3);
        service.upsertPoints("wiki_project_chunks", List.of(
                new QdrantClientService.QdrantPoint("chunk-1", List.of(0.1d, 0.2d, 0.3d), Map.of("pageId", 15L, "title", "登录说明", "plainText", "登录说明正文"))
        ));
        List<QdrantClientService.QdrantSearchHit> hits = service.search(
                "wiki_project_chunks",
                List.of(0.1d, 0.2d, 0.3d),
                Map.of("projectId", 12L),
                8
        );

        assertThat(hits).hasSize(1);
        assertThat(hits.get(0).id()).isEqualTo("chunk-1");
        assertThat(hits.get(0).score()).isEqualTo(0.91d);
        assertThat(hits.get(0).payload()).containsEntry("title", "登录说明");
        assertThat(lastRequestPath.get()).contains("/points/search");
        assertThat(lastRequestBody.get()).contains("\"projectId\"");
    }

    @Test
    void shouldWriteQdrantCompatiblePointIdAndKeepLogicalChunkIdInPayload() throws Exception {
        QdrantClientService service = createService();

        service.upsertPoints("wiki_project_chunks", List.of(
                new QdrantClientService.QdrantPoint("wiki-space:1:2:0", List.of(0.1d, 0.2d, 0.3d), Map.of("chunkId", "wiki-space:1:2:0"))
        ));

        assertThat(lastRequestBody.get()).contains("\"chunkId\":\"wiki-space:1:2:0\"");
        assertThat(lastRequestBody.get()).doesNotContain("\"id\":\"wiki-space:1:2:0\"");
        assertThat(lastRequestBody.get()).containsPattern("\\\"id\\\":\\\"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\\"");
    }

    @Test
    void shouldIgnoreCollectionAlreadyExists() throws Exception {
        QdrantClientService service = createService();

        service.createCollection("wiki_project_chunks", 3);
        service.createCollection("wiki_project_chunks", 3);

        assertThat(lastRequestPath.get()).contains("/collections/wiki_project_chunks");
    }

    private QdrantClientService createService() throws Exception {
        server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/collections", this::handleRequest);
        server.start();
        return new QdrantClientService(
                new WikiKnowledgeProperties(
                        true,
                        "http://localhost:" + server.getAddress().getPort(),
                        "",
                        20,
                        "wiki_project_chunks",
                        "wiki_space_chunks",
                        9L,
                        12,
                        24,
                        "",
                        "",
                        "",
                        "openai-compatible",
                        15,
                        10
                ),
                new ObjectMapper()
        );
    }

    private void handleRequest(HttpExchange exchange) throws IOException {
        lastRequestPath.set(exchange.getRequestURI().toString());
        lastRequestBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
        String body = "{\"status\":\"ok\"}";
        int status = 200;
        if ("PUT".equals(exchange.getRequestMethod()) && exchange.getRequestURI().toString().equals("/collections/wiki_project_chunks")) {
            if (collectionCreateCount.incrementAndGet() > 1) {
                status = 409;
                body = "{\"status\":{\"error\":\"Collection wiki_project_chunks already exists\"}}";
            }
        }
        if (exchange.getRequestURI().toString().endsWith("/points/search")) {
            body = """
                    {
                      "result": [
                        {
                          "id": "chunk-1",
                          "score": 0.91,
                          "payload": {
                            "pageId": 15,
                            "title": "登录说明",
                            "plainText": "登录说明正文"
                          }
                        }
                      ]
                    }
                    """;
        }
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream outputStream = exchange.getResponseBody()) {
            outputStream.write(bytes);
        }
    }
}
