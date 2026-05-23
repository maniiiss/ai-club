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
                        {"id":13,"repo_id":77,"name":"AI_CLUB_PIPELINE_1_SSH_PRIVATE_KEY","value":"","events":["push","manual"],"images":["alpine","alpine:3.20"]}
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
                    List.of("alpine", "alpine:3.20")
            );

            assertThat(requests).containsExactly(
                    "GET /api/repos/77/secrets/AI_CLUB_PIPELINE_1_SSH_PRIVATE_KEY",
                    "PATCH /api/repos/77/secrets/AI_CLUB_PIPELINE_1_SSH_PRIVATE_KEY"
            );
            JsonNode payload = objectMapper.readTree(bodies.get(0));
            assertThat(payload.path("name").asText()).isEqualTo("AI_CLUB_PIPELINE_1_SSH_PRIVATE_KEY");
            assertThat(payload.path("value").asText()).isEqualTo("private-key");
            assertThat(readTextArray(payload.path("images"))).containsExactly("alpine", "alpine:3.20");
            assertThat(secret.events()).containsExactly("push", "manual");
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
