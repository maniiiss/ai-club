package com.aiclub.platform.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class GitlabApiServiceTests {

    @Mock
    private HttpClient httpClient;

    @Mock
    private HttpResponse<String> httpResponse;

    private GitlabApiService gitlabApiService;

    @BeforeEach
    void setUp() {
        gitlabApiService = new GitlabApiService(new ObjectMapper(), httpClient);
    }

    @Test
    void shouldListUsersWithSearchKeywordAndParseUserSnapshot() throws Exception {
        when(httpResponse.statusCode()).thenReturn(200);
        when(httpResponse.body()).thenReturn("""
                [
                  {
                    "id": 991,
                    "username": "zhangsan",
                    "name": "张三",
                    "public_email": "zhangsan@example.com",
                    "avatar_url": "http://gitlab.example.com/avatar/zhangsan.png",
                    "web_url": "http://gitlab.example.com/zhangsan"
                  }
                ]
                """);
        when(httpClient.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class))).thenReturn(httpResponse);

        List<GitlabApiService.GitlabUser> users = gitlabApiService.listUsers(
                "http://gitlab.example.com/api/v4",
                "plain-token",
                "张三"
        );

        assertThat(users).hasSize(1);
        assertThat(users.get(0).id()).isEqualTo(991L);
        assertThat(users.get(0).username()).isEqualTo("zhangsan");
        assertThat(users.get(0).name()).isEqualTo("张三");
        assertThat(users.get(0).email()).isEqualTo("zhangsan@example.com");
        assertThat(users.get(0).avatarUrl()).isEqualTo("http://gitlab.example.com/avatar/zhangsan.png");
        assertThat(users.get(0).webUrl()).isEqualTo("http://gitlab.example.com/zhangsan");

        ArgumentCaptor<HttpRequest> requestCaptor = ArgumentCaptor.forClass(HttpRequest.class);
        verify(httpClient).send(requestCaptor.capture(), any(HttpResponse.BodyHandler.class));
        HttpRequest request = requestCaptor.getValue();
        assertThat(request.uri().toString()).startsWith("http://gitlab.example.com/api/v4/users?");
        assertThat(request.uri().toString()).contains("per_page=100");
        assertThat(request.uri().toString()).contains("search=%E5%BC%A0%E4%B8%89");
        assertThat(request.headers().firstValue("PRIVATE-TOKEN")).contains("plain-token");
    }
}
