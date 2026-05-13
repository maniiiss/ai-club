package com.aiclub.platform.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpHeaders;

import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.net.ConnectException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Flow;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class YaadeClientServiceTests {

    @Mock
    private HttpClient httpClient;

    @Mock
    private HttpResponse<byte[]> httpResponse;

    private YaadeClientService yaadeClientService;

    @BeforeEach
    void setUp() {
        yaadeClientService = new YaadeClientService(
                new YaadeProperties(
                        "http://localhost:9339/api/yaade/proxy",
                        "admin",
                        "admin-password",
                        "default-password",
                        "未关联项目",
                        120
                ),
                new ObjectMapper(),
                httpClient
        );
    }

    @Test
    void shouldLoginAndExtractCookieHeader() throws Exception {
        when(httpResponse.statusCode()).thenReturn(200);
        when(httpResponse.body()).thenReturn("{}".getBytes());
        when(httpResponse.headers()).thenReturn(java.net.http.HttpHeaders.of(
                Map.of("Set-Cookie", List.of("vertx-web.session=session-a; Path=/api/yaade/proxy; HttpOnly")),
                (left, right) -> true
        ));
        when(httpClient.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class))).thenReturn(httpResponse);

        YaadeClientService.YaadeSession session = yaadeClientService.login("alice", "secret");

        assertThat(session.cookieHeader()).isEqualTo("vertx-web.session=session-a");

        ArgumentCaptor<HttpRequest> requestCaptor = ArgumentCaptor.forClass(HttpRequest.class);
        verify(httpClient).send(requestCaptor.capture(), any(HttpResponse.BodyHandler.class));
        assertThat(requestCaptor.getValue().uri().toString()).isEqualTo("http://localhost:9339/api/yaade/proxy/api/login");
        assertThat(requestCaptor.getValue().headers().firstValue(HttpHeaders.CONTENT_TYPE)).contains("application/json");
    }

    @Test
    void shouldCreateUserWithGroupsPayload() throws Exception {
        when(httpResponse.statusCode()).thenReturn(200);
        when(httpResponse.body()).thenReturn("""
                {"id":11,"username":"aiclub-7","data":{"groups":["aiclub-project-7","aiclub-api-public"]}}
                """.getBytes());
        when(httpResponse.headers()).thenReturn(java.net.http.HttpHeaders.of(Map.of(), (left, right) -> true));
        when(httpClient.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class))).thenReturn(httpResponse);

        YaadeClientService.YaadeRemoteUser user = yaadeClientService.createUser(
                new YaadeClientService.YaadeSession("vertx-web.session=session-a"),
                "aiclub-7",
                List.of("aiclub-project-7", "aiclub-api-public")
        );

        assertThat(user.id()).isEqualTo(11L);
        assertThat(user.groups()).containsExactly("aiclub-project-7", "aiclub-api-public");

        ArgumentCaptor<HttpRequest> requestCaptor = ArgumentCaptor.forClass(HttpRequest.class);
        verify(httpClient).send(requestCaptor.capture(), any(HttpResponse.BodyHandler.class));
        assertThat(requestCaptor.getValue().headers().firstValue(HttpHeaders.COOKIE)).contains("vertx-web.session=session-a");
        assertThat(requestCaptor.getValue().uri().toString()).endsWith("/api/users");
    }

    @Test
    void shouldCreateRestRequestAgainstYaadeApi() throws Exception {
        when(httpResponse.statusCode()).thenReturn(200);
        when(httpResponse.body()).thenReturn("""
                {"id":21,"collectionId":51,"type":"REST","version":"1.0.0","data":{"name":"查询用户","uri":"/api/users","method":"GET"}}
                """.getBytes(StandardCharsets.UTF_8));
        when(httpResponse.headers()).thenReturn(java.net.http.HttpHeaders.of(Map.of(), (left, right) -> true));
        when(httpClient.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class))).thenReturn(httpResponse);
        ObjectNode requestData = new ObjectMapper().createObjectNode()
                .put("name", "查询用户")
                .put("uri", "/api/users")
                .put("method", "GET");

        YaadeClientService.YaadeRemoteRequest request = yaadeClientService.createRestRequest(
                new YaadeClientService.YaadeSession("vertx-web.session=session-a"),
                51L,
                requestData
        );

        assertThat(request.id()).isEqualTo(21L);
        assertThat(request.data().path("uri").asText()).isEqualTo("/api/users");
        ArgumentCaptor<HttpRequest> requestCaptor = ArgumentCaptor.forClass(HttpRequest.class);
        verify(httpClient).send(requestCaptor.capture(), any(HttpResponse.BodyHandler.class));
        assertThat(requestCaptor.getValue().method()).isEqualTo("POST");
        assertThat(requestCaptor.getValue().uri().toString()).endsWith("/api/request");
    }

    @Test
    void shouldReturnOriginalRequestWhenUpdateRequestResponseBodyIsEmpty() throws Exception {
        when(httpResponse.statusCode()).thenReturn(200);
        when(httpResponse.body()).thenReturn(new byte[0]);
        when(httpResponse.headers()).thenReturn(java.net.http.HttpHeaders.of(Map.of(), (left, right) -> true));
        when(httpClient.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class))).thenReturn(httpResponse);
        ObjectNode data = new ObjectMapper().createObjectNode()
                .put("name", "查询用户")
                .put("uri", "/api/users")
                .put("method", "GET");
        ObjectNode raw = new ObjectMapper().createObjectNode()
                .put("id", 21)
                .put("collectionId", 51)
                .put("type", "REST")
                .put("version", "1.0.0");
        raw.set("data", data.deepCopy());
        YaadeClientService.YaadeRemoteRequest request = new YaadeClientService.YaadeRemoteRequest(21L, 51L, "REST", "1.0.0", data, raw);

        YaadeClientService.YaadeRemoteRequest updated = yaadeClientService.updateRequest(
                new YaadeClientService.YaadeSession("vertx-web.session=session-a"),
                request
        );

        assertThat(updated.id()).isEqualTo(21L);
        assertThat(updated.data().path("uri").asText()).isEqualTo("/api/users");
    }

    @Test
    void shouldCreateChildCollectionWithParentIdPayload() throws Exception {
        @SuppressWarnings("unchecked")
        HttpResponse<byte[]> listResponse = (HttpResponse<byte[]>) org.mockito.Mockito.mock(HttpResponse.class);
        @SuppressWarnings("unchecked")
        HttpResponse<byte[]> createResponse = (HttpResponse<byte[]>) org.mockito.Mockito.mock(HttpResponse.class);
        when(listResponse.statusCode()).thenReturn(200);
        when(listResponse.body()).thenReturn("""
                [
                  {
                    "id": 51,
                    "ownerId": 1,
                    "version": "1.0.0",
                    "data": {
                      "name": "演示项目",
                      "groups": ["aiclub-project-7"]
                    },
                    "requests": [],
                    "scripts": [],
                    "children": [
                      {
                        "id": 61,
                        "ownerId": 1,
                        "version": "1.0.0",
                        "data": {
                          "name": "已存在目录",
                          "groups": ["aiclub-project-7"],
                          "parentId": 51,
                          "rank": 0
                        },
                        "requests": [],
                        "scripts": []
                      }
                    ]
                  }
                ]
                """.getBytes(StandardCharsets.UTF_8));
        when(listResponse.headers()).thenReturn(java.net.http.HttpHeaders.of(Map.of(), (left, right) -> true));
        when(createResponse.statusCode()).thenReturn(200);
        when(createResponse.body()).thenReturn("""
                {
                  "id": 62,
                  "ownerId": 1,
                  "version": "1.0.0",
                  "data": {
                    "name": "用户管理",
                    "groups": ["aiclub-project-7"],
                    "parentId": 51,
                    "rank": 1
                  },
                  "requests": [],
                  "scripts": []
                }
                """.getBytes(StandardCharsets.UTF_8));
        when(createResponse.headers()).thenReturn(java.net.http.HttpHeaders.of(Map.of(), (left, right) -> true));
        when(httpClient.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class))).thenReturn(listResponse, createResponse);

        YaadeClientService.YaadeRemoteCollection collection = yaadeClientService.createCollection(
                new YaadeClientService.YaadeSession("vertx-web.session=session-a"),
                "用户管理",
                51L,
                List.of("aiclub-project-7")
        );

        assertThat(collection.parentId()).isEqualTo(51L);
        assertThat(collection.rank()).isEqualTo(1);
        ArgumentCaptor<HttpRequest> requestCaptor = ArgumentCaptor.forClass(HttpRequest.class);
        verify(httpClient, org.mockito.Mockito.times(2)).send(requestCaptor.capture(), any(HttpResponse.BodyHandler.class));
        HttpRequest createRequest = requestCaptor.getAllValues().get(1);
        assertThat(createRequest.method()).isEqualTo("POST");
        assertThat(createRequest.uri().toString()).endsWith("/api/collection");
        assertThat(readBody(createRequest)).contains("\"parentId\":51");
        assertThat(readBody(createRequest)).contains("\"name\":\"用户管理\"");
    }

    @Test
    void shouldDeleteCollectionAgainstYaadeApi() throws Exception {
        when(httpResponse.statusCode()).thenReturn(200);
        when(httpResponse.body()).thenReturn("{}".getBytes(StandardCharsets.UTF_8));
        when(httpResponse.headers()).thenReturn(java.net.http.HttpHeaders.of(Map.of(), (left, right) -> true));
        when(httpClient.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class))).thenReturn(httpResponse);

        yaadeClientService.deleteCollection(new YaadeClientService.YaadeSession("vertx-web.session=session-a"), 88L);

        ArgumentCaptor<HttpRequest> requestCaptor = ArgumentCaptor.forClass(HttpRequest.class);
        verify(httpClient).send(requestCaptor.capture(), any(HttpResponse.BodyHandler.class));
        assertThat(requestCaptor.getValue().method()).isEqualTo("DELETE");
        assertThat(requestCaptor.getValue().uri().toString()).endsWith("/api/collection/88");
    }

    @Test
    void shouldFlagRedirectToLoginAsUnauthorized() {
        YaadeClientService.RawResponse response = new YaadeClientService.RawResponse(
                302,
                new byte[0],
                Map.of(HttpHeaders.LOCATION, List.of("/api/yaade/proxy/api/login")),
                List.of()
        );

        assertThat(response.isUnauthorized()).isTrue();
    }

    @Test
    void shouldExposeReadableMessageWhenConnectExceptionHasNoMessage() throws Exception {
        when(httpClient.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
                .thenThrow(new ConnectException());

        assertThatThrownBy(() -> yaadeClientService.login("alice", "secret"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("无法连接 Yaade 服务")
                .hasMessageContaining("POST")
                .hasMessageContaining("/api/login");
    }

    private String readBody(HttpRequest request) throws InterruptedException {
        HttpRequest.BodyPublisher publisher = request.bodyPublisher().orElseThrow();
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        CountDownLatch completed = new CountDownLatch(1);
        publisher.subscribe(new Flow.Subscriber<>() {
            private Flow.Subscription subscription;

            @Override
            public void onSubscribe(Flow.Subscription subscription) {
                this.subscription = subscription;
                subscription.request(Long.MAX_VALUE);
            }

            @Override
            public void onNext(ByteBuffer item) {
                byte[] bytes = new byte[item.remaining()];
                item.get(bytes);
                output.writeBytes(bytes);
            }

            @Override
            public void onError(Throwable throwable) {
                completed.countDown();
            }

            @Override
            public void onComplete() {
                if (subscription != null) {
                    subscription.cancel();
                }
                completed.countDown();
            }
        });
        completed.await(2, TimeUnit.SECONDS);
        return output.toString(StandardCharsets.UTF_8);
    }
}
