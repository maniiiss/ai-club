package com.aiclub.platform.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/**
 * 验证文档转换客户端会把 Wiki 导入图片目录一并放进 multipart 请求。
 */
class DocumentMarkdownClientServiceTests {

    @Test
    void shouldIncludeImageDirectoryInMultipartBody() throws Exception {
        DocumentMarkdownClientService clientService = new DocumentMarkdownClientService(
                new ObjectMapper(),
                mock(InternalServiceAuthenticator.class),
                "http://localhost:18081",
                HttpClient.newHttpClient()
        );

        byte[] body = clientService.buildMultipartBody(
                "test-boundary",
                "demo".getBytes(StandardCharsets.UTF_8),
                "demo.pdf",
                "application/pdf",
                DocumentMarkdownService.SCENE_WIKI_IMPORT,
                200000,
                "wiki-spaces/space-8/imports/asset-21"
        );

        String multipart = new String(body, StandardCharsets.UTF_8);
        assertThat(multipart).contains("name=\"imageDirectory\"");
        assertThat(multipart).contains("wiki-spaces/space-8/imports/asset-21");
        assertThat(multipart).contains("name=\"maxChars\"");
        assertThat(multipart).contains("name=\"scene\"");
    }
}
