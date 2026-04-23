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

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 覆盖 Hindsight recall 响应的分数解析与命中择优逻辑，
 * 避免响应包含嵌套命中或字符串分数时被解析成 null。
 */
class HindsightClientServiceTests {

    private HttpServer server;

    @AfterEach
    void tearDown() {
        if (server != null) {
            server.stop(0);
        }
    }

    /**
     * recall 结果数组中的单项命中应优先保留带 score 的候选，
     * 并支持把字符串形式的 score 解析为数值。
     */
    @Test
    void shouldParseStringScoreAndPickBestCandidateInsideOneResultItem() throws Exception {
        server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/", this::writeRecallResponse);
        server.start();

        HindsightClientService service = new HindsightClientService(
                new HindsightProperties("http://localhost:" + server.getAddress().getPort(), "", "git-ai-club", "mid", 30),
                new ObjectMapper()
        );

        List<HindsightClientService.WikiRecallHit> hits = service.recallWikiSpaceDocuments(5L, "证书提醒", 8);

        assertThat(hits).hasSize(2);
        assertThat(hits.get(0).documentId()).isEqualTo("wiki-space-page-15");
        assertThat(hits.get(0).pageId()).isEqualTo(15L);
        assertThat(hits.get(0).title()).isEqualTo("页面A");
        assertThat(hits.get(0).snippet()).isEqualTo("better snippet");
        assertThat(hits.get(0).score()).isEqualTo(0.91d);

        assertThat(hits.get(1).documentId()).isEqualTo("wiki-space-page-16");
        assertThat(hits.get(1).pageId()).isEqualTo(16L);
        assertThat(hits.get(1).score()).isEqualTo(0.42d);
    }

    private void writeRecallResponse(HttpExchange exchange) throws IOException {
        String payload = """
                {
                  "results": [
                    {
                      "document_id": "wiki-space-page-15",
                      "metadata": {
                        "pageId": "15",
                        "title": "页面A"
                      },
                      "snippet": "outer snippet",
                      "match": {
                        "document_id": "wiki-space-page-15",
                        "metadata": {
                          "pageId": "15",
                          "title": "页面A"
                        },
                        "snippet": "better snippet",
                        "score": "0.91"
                      }
                    },
                    {
                      "document_id": "wiki-space-page-16",
                      "metadata": {
                        "pageId": "16",
                        "title": "页面B"
                      },
                      "snippet": "页面B 摘要",
                      "similarity": 0.42
                    }
                  ]
                }
                """;
        byte[] body = payload.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(200, body.length);
        try (OutputStream outputStream = exchange.getResponseBody()) {
            outputStream.write(body);
        }
    }
}
