package com.aiclub.platform.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpHeaders;

import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;

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
    void shouldFlagRedirectToLoginAsUnauthorized() {
        YaadeClientService.RawResponse response = new YaadeClientService.RawResponse(
                302,
                new byte[0],
                Map.of(HttpHeaders.LOCATION, List.of("/api/yaade/proxy/api/login")),
                List.of()
        );

        assertThat(response.isUnauthorized()).isTrue();
    }
}
