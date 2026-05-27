package com.aiclub.platform.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class WoodpeckerApiServiceTests {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void shouldCreateRepositorySecretWhenNotFound() throws Exception {
        List<String> requests = new ArrayList<>();
        List<String> bodies = new ArrayList<>();
        HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/api/repos/77/secrets/AI_CLUB_PIPELINE_1_REGISTRY_PASSWORD", exchange -> {
            requests.add(exchange.getRequestMethod() + " " + exchange.getRequestURI().getPath());
            exchange.sendResponseHeaders(404, -1);
            exchange.close();
        });
        server.createContext("/api/repos/77/secrets", exchange -> {
            requests.add(exchange.getRequestMethod() + " " + exchange.getRequestURI().getPath());
            bodies.add(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] response = """
                    {"id":12,"repo_id":77,"name":"AI_CLUB_PIPELINE_1_REGISTRY_PASSWORD","value":"","events":["push","manual","tag"],"images":["woodpeckerci/plugin-docker-buildx","woodpeckerci/plugin-docker-buildx:2"]}
                    """.getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, response.length);
            exchange.getResponseBody().write(response);
            exchange.close();
        });
        server.start();
        try {
            WoodpeckerApiService service = new WoodpeckerApiService(
                    objectMapper,
                    new WoodpeckerPipelineProperties(true, "http://127.0.0.1:" + server.getAddress().getPort(), "", "token", "5")
            );

            WoodpeckerApiService.WoodpeckerSecret secret = service.upsertRepositorySecret(
                    77L,
                    "AI_CLUB_PIPELINE_1_REGISTRY_PASSWORD",
                    "secret-token",
                    "note",
                    List.of("push", "manual", "tag"),
                    List.of("woodpeckerci/plugin-docker-buildx", "woodpeckerci/plugin-docker-buildx:2")
            );

            assertThat(requests).containsExactly(
                    "GET /api/repos/77/secrets/AI_CLUB_PIPELINE_1_REGISTRY_PASSWORD",
                    "POST /api/repos/77/secrets"
            );
            JsonNode payload = objectMapper.readTree(bodies.get(0));
            assertThat(payload.path("value").asText()).isEqualTo("secret-token");
            assertThat(readTextArray(payload.path("events"))).containsExactly("push", "manual", "tag");
            assertThat(secret.name()).isEqualTo("AI_CLUB_PIPELINE_1_REGISTRY_PASSWORD");
        } finally {
            server.stop(0);
        }
    }

    @Test
    void shouldUpdateRepositorySecretWhenExists() throws Exception {
        List<String> requests = new ArrayList<>();
        List<String> bodies = new ArrayList<>();
        HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/api/repos/77/secrets/AI_CLUB_PIPELINE_1_SSH_PRIVATE_KEY", exchange -> {
            requests.add(exchange.getRequestMethod() + " " + exchange.getRequestURI().getPath());
            if ("GET".equals(exchange.getRequestMethod())) {
                byte[] response = """
                        {"id":13,"repo_id":77,"name":"AI_CLUB_PIPELINE_1_SSH_PRIVATE_KEY","value":"","events":["push"],"images":["alpine"]}
                        """.getBytes(StandardCharsets.UTF_8);
                exchange.sendResponseHeaders(200, response.length);
                exchange.getResponseBody().write(response);
            } else {
                bodies.add(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
                byte[] response = """
                        {"id":13,"repo_id":77,"name":"AI_CLUB_PIPELINE_1_SSH_PRIVATE_KEY","value":"","events":["push","manual"],"images":["alpine"]}
                        """.getBytes(StandardCharsets.UTF_8);
                exchange.sendResponseHeaders(200, response.length);
                exchange.getResponseBody().write(response);
            }
            exchange.close();
        });
        server.start();
        try {
            WoodpeckerApiService service = new WoodpeckerApiService(
                    objectMapper,
                    new WoodpeckerPipelineProperties(true, "http://127.0.0.1:" + server.getAddress().getPort(), "", "token", "5")
            );

            WoodpeckerApiService.WoodpeckerSecret secret = service.upsertRepositorySecret(
                    77L,
                    "AI_CLUB_PIPELINE_1_SSH_PRIVATE_KEY",
                    "private-key",
                    "note",
                    List.of("push", "manual"),
                    List.of()
            );

            assertThat(requests).containsExactly(
                    "GET /api/repos/77/secrets/AI_CLUB_PIPELINE_1_SSH_PRIVATE_KEY",
                    "PATCH /api/repos/77/secrets/AI_CLUB_PIPELINE_1_SSH_PRIVATE_KEY"
            );
            JsonNode payload = objectMapper.readTree(bodies.get(0));
            assertThat(payload.path("name").asText()).isEqualTo("AI_CLUB_PIPELINE_1_SSH_PRIVATE_KEY");
            assertThat(payload.path("value").asText()).isEqualTo("private-key");
            assertThat(readTextArray(payload.path("images"))).isEmpty();
            assertThat(secret.events()).containsExactly("push", "manual");
        } finally {
            server.stop(0);
        }
    }

    @Test
    void shouldFilterShellTraceFromAggregatedLogs() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/api/repos/77/pipelines/19", exchange -> {
            byte[] response = """
                    {
                      "id": 19,
                      "number": 19,
                      "status": "success",
                      "branch": "deploy",
                      "children": [
                        {
                          "id": 101,
                          "name": "ssh-deploy",
                          "state": "success"
                        }
                      ]
                    }
                    """.getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, response.length);
            exchange.getResponseBody().write(response);
            exchange.close();
        });
        server.createContext("/api/repos/77/logs/19/101", exchange -> {
            byte[] response = """
                    [
                      {"line": 15, "data": "+ mkdir -p ~/.ssh && chmod 700 ~/.ssh\\n"},
                      {"line": 16, "data": "+ ssh -i ~/.ssh/id_ai_club -p 2222 'dulihong@root@192.168.111.74@192.168.111.51' 'bash -se' <<'AI_CLUB_REMOTE_SCRIPT'\\n"},
                      {"line": 17, "data": "set -eu\\n"},
                      {"line": 18, "data": "pwd\\n"},
                      {"line": 19, "data": "whoami\\n"},
                      {"line": 20, "data": "AI_CLUB_REMOTE_SCRIPT\\n"},
                      {"line": 21, "data": "/root\\n"},
                      {"line": 22, "data": "root\\n"},
                      {"line": 23, "data": "localhost.localdomain\\n"}
                    ]
                    """.getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, response.length);
            exchange.getResponseBody().write(response);
            exchange.close();
        });
        server.start();
        try {
            WoodpeckerApiService service = new WoodpeckerApiService(
                    objectMapper,
                    new WoodpeckerPipelineProperties(true, "http://127.0.0.1:" + server.getAddress().getPort(), "", "token", "5")
            );

            String log = service.fetchAggregatedLogs(77L, 19);

            assertThat(log).contains("===== ssh-deploy #101 =====");
            assertThat(log).contains("/root");
            assertThat(log).contains("root");
            assertThat(log).doesNotContain("+ mkdir -p ~/.ssh");
            assertThat(log).doesNotContain("AI_CLUB_REMOTE_SCRIPT");
            assertThat(log).doesNotContain("pwd");
        } finally {
            server.stop(0);
        }
    }

    private List<String> readTextArray(JsonNode node) {
        List<String> values = new ArrayList<>();
        node.forEach(item -> values.add(item.asText()));
        return values;
    }
}
