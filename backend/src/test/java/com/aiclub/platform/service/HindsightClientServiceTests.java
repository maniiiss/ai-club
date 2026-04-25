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
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 覆盖 Hindsight 客户端对 recall、实体图和实体详情的解析，
 * 避免 Hindsight 版本字段有轻微差异时直接把记忆事实图链路打断。
 */
class HindsightClientServiceTests {

    private HttpServer server;
    private final AtomicReference<String> lastRequestBody = new AtomicReference<>("");

    @AfterEach
    void tearDown() {
        if (server != null) {
            server.stop(0);
        }
    }

    @Test
    void shouldParseStringScoreAndPickBestCandidateInsideOneResultItem() throws Exception {
        HindsightClientService service = createService();

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

    @Test
    void shouldParseMemoryFactEntityGraphWithDataWrappers() throws Exception {
        HindsightClientService service = createService();

        HindsightClientService.MemoryEntityGraph graph = service.fetchEntityGraph("test-bank", 50);

        assertThat(graph.nodes()).hasSize(2);
        assertThat(graph.nodes().get(0).id()).isEqualTo("Paris");
        assertThat(graph.nodes().get(0).label()).isEqualTo("Paris");
        assertThat(graph.nodes().get(0).mentionCount()).isEqualTo(4);
        assertThat(graph.edges()).hasSize(1);
        assertThat(graph.edges().get(0).sourceId()).isEqualTo("Paris");
        assertThat(graph.edges().get(0).targetId()).isEqualTo("Berlin");
        assertThat(graph.edges().get(0).relationType()).isEqualTo("co_occurrence");
        assertThat(graph.edges().get(0).weight()).isEqualTo(4.0d);
    }

    @Test
    void shouldParseMemoryFactEntityDetailWithObservations() throws Exception {
        HindsightClientService service = createService();

        HindsightClientService.MemoryEntityDetail detail = service.getEntityDetail("test-bank", "Paris");

        assertThat(detail.id()).isEqualTo("Paris");
        assertThat(detail.canonicalName()).isEqualTo("Paris");
        assertThat(detail.mentionCount()).isEqualTo(5);
        assertThat(detail.aliases()).containsExactly("巴黎");
        assertThat(detail.observations()).hasSize(1);
        assertThat(detail.observations().get(0).text()).isEqualTo("Paris is the capital of France.");
    }

    @Test
    void shouldSendProjectTagsAndWorldTypeWhenRecallingMemoryFacts() throws Exception {
        HindsightClientService service = createService();

        List<HindsightClientService.MemoryWorldFact> facts = service.recallWorldFacts(
                "test-bank",
                "Paris Berlin",
                List.of("project:12", "source:wiki"),
                6
        );

        assertThat(facts).hasSize(1);
        assertThat(facts.get(0).id()).isEqualTo("fact-1");
        assertThat(facts.get(0).summary()).contains("Paris and Berlin");
        assertThat(facts.get(0).tags()).contains("project:12", "source:wiki");
        assertThat(lastRequestBody.get()).contains("\"types\":[\"world\"]");
        assertThat(lastRequestBody.get()).contains("\"tags\":[\"project:12\",\"source:wiki\"]");
    }

    private HindsightClientService createService() throws Exception {
        server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/v1/default/banks", this::handleRequest);
        server.start();
        return new HindsightClientService(
                new HindsightProperties("http://localhost:" + server.getAddress().getPort(), "", "git-ai-club", "mid", 30),
                new ObjectMapper()
        );
    }

    private void handleRequest(HttpExchange exchange) throws IOException {
        lastRequestBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
        String path = exchange.getRequestURI().getRawPath();
        String body;
        if (path.contains("wiki%3Aspace%3A5") && path.endsWith("/memories/recall")) {
            body = """
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
        } else if (path.endsWith("/graph")) {
            body = """
                    {
                      "nodes": [
                        {
                          "id": "Paris",
                          "data": {
                            "id": "Paris",
                            "label": "Paris",
                            "mentionCount": 4,
                            "type": "LOCATION",
                            "aliases": ["巴黎"]
                          }
                        },
                        {
                          "id": "Berlin",
                          "data": {
                            "id": "Berlin",
                            "label": "Berlin",
                            "mentionCount": 3,
                            "type": "LOCATION"
                          }
                        }
                      ],
                      "edges": [
                        {
                          "id": "Paris-Berlin-cooccurrence",
                          "source": "Paris",
                          "target": "Berlin",
                          "data": {
                            "id": "Paris-Berlin-cooccurrence",
                            "source": "Paris",
                            "target": "Berlin",
                            "linkType": "co_occurrence",
                            "weight": 4,
                            "lastCooccurred": "2026-04-24T09:00:00Z"
                          }
                        }
                      ]
                    }
                    """;
        } else if (path.endsWith("/entities/Paris")) {
            body = """
                    {
                      "data": {
                        "id": "Paris",
                        "canonicalName": "Paris",
                        "mentionCount": 5,
                        "aliases": ["巴黎"],
                        "type": "LOCATION",
                        "firstSeen": "2026-04-01T10:00:00Z",
                        "lastSeen": "2026-04-24T09:00:00Z",
                        "observations": [
                          {
                            "observation": "Paris is the capital of France.",
                            "notedAt": "2026-04-24T09:00:00Z"
                          }
                        ]
                      }
                    }
                    """;
        } else if (path.endsWith("/test-bank/memories/recall")) {
            body = """
                    {
                      "results": [
                        {
                          "id": "fact-1",
                          "type": "world",
                          "text": "Paris and Berlin are often discussed together.",
                          "score": 0.88,
                          "date": "2026-04-24T09:00:00Z",
                          "tags": ["project:12", "source:wiki"],
                          "entities": ["Paris", "Berlin"],
                          "source_fact_ids": ["source-1"]
                        }
                      ],
                      "source_facts": {
                        "source-1": {
                          "id": "source-1",
                          "type": "world",
                          "tags": ["project:12", "source:wiki"],
                          "context": "co_occurrence"
                        }
                      }
                    }
                    """;
        } else {
            body = "{\"results\":[]}";
        }
        byte[] responseBody = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(200, responseBody.length);
        try (OutputStream outputStream = exchange.getResponseBody()) {
            outputStream.write(responseBody);
        }
    }
}
