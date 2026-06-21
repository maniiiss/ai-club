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

    @Test
    void shouldScrollAllPointsAcrossPages() throws Exception {
        QdrantClientService service = createService();

        List<QdrantClientService.QdrantScrollPoint> points = service.scrollPoints(
                "wiki_space_chunks",
                Map.of("spaceId", 8L),
                true,
                2
        );

        // mock 第一页返回 1 个 point 且带 next_page_offset，第二页返回 1 个且无 offset，应翻页拉全 2 条。
        assertThat(points).hasSize(2);
        assertThat(points.get(0).id()).isEqualTo("p-1");
        assertThat(points.get(0).vector()).containsExactly(0.1d, 0.2d, 0.3d);
        assertThat(points.get(0).payload()).containsEntry("pageId", 201);
        assertThat(points.get(1).id()).isEqualTo("p-2");
        assertThat(lastRequestPath.get()).contains("/points/scroll");
        assertThat(lastRequestBody.get()).contains("\"with_vector\":true");
    }

    @Test
    void shouldIgnoreDeleteWhenCollectionMissing() throws Exception {
        QdrantClientService service = createService();

        // collection 不存在时 Qdrant 返回 404，删除应静默降级、不抛异常。
        org.assertj.core.api.Assertions.assertThatCode(() ->
                service.deletePointsByFilter("missing_collection", Map.of("spaceId", 8L, "pageId", 5L))
        ).doesNotThrowAnyException();
    }

    private QdrantClientService createService() throws Exception {        server = HttpServer.create(new InetSocketAddress(0), 0);
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
                        "",
                        "",
                        "",
                        "OPENAI",
                        12,
                        24,
                        "",
                        "",
                        "",
                        "openai-compatible",
                        15,
                        10,
                        0.78,
                        6,
                        256
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
        if (exchange.getRequestURI().toString().endsWith("/points/scroll")) {
            // 第一页带 next_page_offset，第二页无，覆盖翻页拉全逻辑。
            if (lastRequestBody.get().contains("\"offset\":\"page-2\"")) {
                body = """
                        {
                          "result": {
                            "points": [
                              {"id": "p-2", "vector": [0.4, 0.5, 0.6], "payload": {"pageId": 202}}
                            ],
                            "next_page_offset": null
                          }
                        }
                        """;
            } else {
                body = """
                        {
                          "result": {
                            "points": [
                              {"id": "p-1", "vector": [0.1, 0.2, 0.3], "payload": {"pageId": 201}}
                            ],
                            "next_page_offset": "page-2"
                          }
                        }
                        """;
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
        if (exchange.getRequestURI().toString().endsWith("/points/delete?wait=true")
                && exchange.getRequestURI().toString().contains("missing_collection")) {
            // 模拟 collection 不存在时 Qdrant 返回 404。
            status = 404;
            body = "{\"status\":{\"error\":\"Not found: Collection `missing_collection` doesn't exist!\"}}";
        }
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream outputStream = exchange.getResponseBody()) {
            outputStream.write(bytes);
        }
    }
}
