package com.aiclub.platform.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.util.unit.DataSize;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 验证 Hermes 语音转写服务能正确校验短音频并调用 OpenAI 兼容接口。
 */
class HermesSpeechTranscriptionServiceTests {

    /**
     * 转写成功时应把 text 返回给前端，同时按 multipart 规范提交 model 和 file 字段。
     */
    @Test
    void shouldTranscribeAudioByOpenAiCompatibleApi() throws IOException {
        AtomicReference<String> authorizationHeader = new AtomicReference<>("");
        AtomicReference<String> contentTypeHeader = new AtomicReference<>("");
        AtomicReference<String> requestBody = new AtomicReference<>("");
        HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/audio/transcriptions", exchange -> {
            authorizationHeader.set(exchange.getRequestHeaders().getFirst("Authorization"));
            contentTypeHeader.set(exchange.getRequestHeaders().getFirst("Content-Type"));
            requestBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] responseBody = "{\"text\":\"帮我总结当前迭代风险\"}".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, responseBody.length);
            try (OutputStream outputStream = exchange.getResponseBody()) {
                outputStream.write(responseBody);
            }
        });
        server.start();

        try {
            HermesSpeechTranscriptionService service = createService(
                    "http://127.0.0.1:" + server.getAddress().getPort(),
                    "speech-key",
                    "gpt-4o-mini-transcribe",
                    DataSize.ofMegabytes(20)
            );

            String text = service.transcribe(new MockMultipartFile(
                    "file",
                    "voice.webm",
                    "audio/webm",
                    "voice-sample".getBytes(StandardCharsets.UTF_8)
            ));

            assertThat(text).isEqualTo("帮我总结当前迭代风险");
            assertThat(authorizationHeader.get()).isEqualTo("Bearer speech-key");
            assertThat(contentTypeHeader.get()).contains("multipart/form-data");
            assertThat(contentTypeHeader.get()).contains("boundary=");
            assertThat(requestBody.get()).contains("name=\"model\"");
            assertThat(requestBody.get()).contains("gpt-4o-mini-transcribe");
            assertThat(requestBody.get()).contains("name=\"file\"; filename=\"hermes-voice.webm\"");
        } finally {
            server.stop(0);
        }
    }

    /**
     * 未配置 API Key 时应直接返回友好错误，避免前端录音后才遇到模糊失败。
     */
    @Test
    void shouldRejectWhenApiKeyIsMissing() {
        HermesSpeechTranscriptionService service = createService(
                "https://api.openai.com/v1",
                "",
                "gpt-4o-mini-transcribe",
                DataSize.ofMegabytes(20)
        );

        assertThatThrownBy(() -> service.transcribe(new MockMultipartFile(
                "file",
                "voice.webm",
                "audio/webm",
                "voice-sample".getBytes(StandardCharsets.UTF_8)
        )))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("请先配置 Hermes 语音转写 API Key");
    }

    /**
     * 非支持格式应在本地校验阶段直接拦下，不把无效请求发给上游服务。
     */
    @Test
    void shouldRejectUnsupportedAudioFormat() {
        HermesSpeechTranscriptionService service = createService(
                "https://api.openai.com/v1",
                "speech-key",
                "gpt-4o-mini-transcribe",
                DataSize.ofMegabytes(20)
        );

        assertThatThrownBy(() -> service.transcribe(new MockMultipartFile(
                "file",
                "voice.ogg",
                "audio/ogg",
                "voice-sample".getBytes(StandardCharsets.UTF_8)
        )))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("仅支持 WEBM、WAV、MP3、M4A 语音文件");
    }

    /**
     * 文件大小超过约定上限时应返回稳定错误，避免继续占用上游转写额度。
     */
    @Test
    void shouldRejectOversizedAudioFile() {
        HermesSpeechTranscriptionService service = createService(
                "https://api.openai.com/v1",
                "speech-key",
                "gpt-4o-mini-transcribe",
                DataSize.ofMegabytes(1)
        );

        assertThatThrownBy(() -> service.transcribe(new MockMultipartFile(
                "file",
                "voice.webm",
                "audio/webm",
                new byte[1024 * 1024 + 1]
        )))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("语音文件大小不能超过1MB");
    }

    /**
     * 上游失败或返回缺少 text 的异常体时，应转换成可读提示暴露给前端。
     */
    @Test
    void shouldMapUpstreamErrorsAndMissingText() throws IOException {
        AtomicInteger requestCount = new AtomicInteger();
        HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/audio/transcriptions", exchange -> {
            int current = requestCount.incrementAndGet();
            byte[] responseBody = current == 1
                    ? "{\"error\":{\"message\":\"quota exceeded\"}}".getBytes(StandardCharsets.UTF_8)
                    : "{\"language\":\"zh\"}".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(current == 1 ? 429 : 200, responseBody.length);
            try (OutputStream outputStream = exchange.getResponseBody()) {
                outputStream.write(responseBody);
            }
        });
        server.start();

        try {
            HermesSpeechTranscriptionService quotaService = createService(
                    "http://127.0.0.1:" + server.getAddress().getPort(),
                    "speech-key",
                    "gpt-4o-mini-transcribe",
                    DataSize.ofMegabytes(20)
            );
            HermesSpeechTranscriptionService missingTextService = createService(
                    "http://127.0.0.1:" + server.getAddress().getPort(),
                    "speech-key",
                    "gpt-4o-mini-transcribe",
                    DataSize.ofMegabytes(20)
            );

            MockMultipartFile file = new MockMultipartFile(
                    "file",
                    "voice.webm",
                    "audio/webm",
                    "voice-sample".getBytes(StandardCharsets.UTF_8)
            );

            assertThatThrownBy(() -> quotaService.transcribe(file))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessage("Hermes 语音转写失败：quota exceeded");
            assertThatThrownBy(() -> missingTextService.transcribe(file))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessage("Hermes 语音转写失败：服务未返回有效文本，请尽量靠近麦克风并完整说一句话");
        } finally {
            server.stop(0);
        }
    }

    private HermesSpeechTranscriptionService createService(String baseUrl,
                                                           String apiKey,
                                                           String model,
                                                           DataSize maxFileSize) {
        HermesSpeechProperties properties = new HermesSpeechProperties(
                baseUrl,
                apiKey,
                model,
                60,
                maxFileSize
        );
        return new HermesSpeechTranscriptionService(properties, new ObjectMapper());
    }
}
