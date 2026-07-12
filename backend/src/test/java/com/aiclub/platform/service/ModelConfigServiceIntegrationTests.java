package com.aiclub.platform.service;

import com.aiclub.platform.dto.AiModelConfigSummary;
import com.aiclub.platform.dto.ModelTestResult;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.request.AiModelConfigRequest;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
@Transactional
class ModelConfigServiceIntegrationTests {

    @Autowired
    private ModelConfigService modelConfigService;

    /**
     * 默认下拉选项应只返回对话模型，同时分页查询支持按模型类型筛选。
     */
    @Test
    void shouldDefaultOptionListToChatModelsAndSupportModelTypeFiltering() {
        AiModelConfigSummary chatModel = modelConfigService.createConfig(new AiModelConfigRequest(
                "代码助手",
                ModelConfigService.MODEL_TYPE_CHAT,
                ModelConfigService.PROVIDER_OPENAI,
                "https://api.openai.com/v1",
                "gpt-5.4",
                ModelConfigService.OPENAI_API_MODE_AUTO,
                "chat-key",
                "默认对话模型",
                true
        ));
        AiModelConfigSummary embeddingModel = modelConfigService.createConfig(new AiModelConfigRequest(
                "知识检索向量",
                ModelConfigService.MODEL_TYPE_EMBEDDING,
                ModelConfigService.PROVIDER_OPENAI,
                "https://api.openai.com/v1",
                "text-embedding-3-large",
                ModelConfigService.OPENAI_API_MODE_AUTO,
                "embedding-key",
                "默认向量模型",
                true
        ));

        List<AiModelConfigSummary> defaultOptions = modelConfigService.listEnabledOptions();
        List<AiModelConfigSummary> embeddingOptions = modelConfigService.listEnabledOptions(ModelConfigService.MODEL_TYPE_EMBEDDING);
        PageResponse<AiModelConfigSummary> embeddingPage = modelConfigService.pageConfigs(
                1,
                10,
                null,
                null,
                ModelConfigService.MODEL_TYPE_EMBEDDING,
                true
        );

        assertThat(defaultOptions).extracting(AiModelConfigSummary::id).containsExactly(chatModel.id());
        assertThat(defaultOptions).extracting(AiModelConfigSummary::modelType).containsOnly(ModelConfigService.MODEL_TYPE_CHAT);
        assertThat(defaultOptions).extracting(AiModelConfigSummary::openaiApiMode).containsOnly(ModelConfigService.OPENAI_API_MODE_AUTO);
        assertThat(embeddingOptions).extracting(AiModelConfigSummary::id).containsExactly(embeddingModel.id());
        assertThat(embeddingOptions).extracting(AiModelConfigSummary::modelType).containsOnly(ModelConfigService.MODEL_TYPE_EMBEDDING);
        assertThat(embeddingPage.records()).extracting(AiModelConfigSummary::id).containsExactly(embeddingModel.id());
        assertThat(embeddingPage.records()).extracting(AiModelConfigSummary::modelType).containsOnly(ModelConfigService.MODEL_TYPE_EMBEDDING);
    }

    /**
     * Embedding 模型测试应调用 embeddings 接口，并从返回向量中提取维度信息。
     */
    @Test
    void shouldUseEmbeddingsEndpointWhenTestingEmbeddingModel() throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/embeddings", exchange -> {
            byte[] responseBody = "{\"data\":[{\"embedding\":[0.11,0.22,0.33]}]}".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, responseBody.length);
            try (OutputStream outputStream = exchange.getResponseBody()) {
                outputStream.write(responseBody);
            }
        });
        server.start();

        try {
            AiModelConfigSummary embeddingModel = modelConfigService.createConfig(new AiModelConfigRequest(
                    "本地 Embedding",
                    ModelConfigService.MODEL_TYPE_EMBEDDING,
                    ModelConfigService.PROVIDER_OPENAI,
                    "http://127.0.0.1:" + server.getAddress().getPort(),
                    "text-embedding-3-small",
                    ModelConfigService.OPENAI_API_MODE_AUTO,
                    "embedding-key",
                    "本地测试服务",
                    true
            ));

            ModelTestResult result = modelConfigService.testConfig(embeddingModel.id());

            assertThat(result.success()).isTrue();
            assertThat(result.modelType()).isEqualTo(ModelConfigService.MODEL_TYPE_EMBEDDING);
            assertThat(result.message()).contains("3 维向量");
        } finally {
            server.stop(0);
        }
    }

    /**
     * Embedding 模型不允许走文本生成调用，避免误接到现有对话链路。
     */
    @Test
    void shouldRejectPromptInvocationForEmbeddingModel() {
        AiModelConfigSummary embeddingModel = modelConfigService.createConfig(new AiModelConfigRequest(
                "检索向量模型",
                ModelConfigService.MODEL_TYPE_EMBEDDING,
                ModelConfigService.PROVIDER_OPENAI,
                "https://api.openai.com/v1",
                "text-embedding-3-large",
                ModelConfigService.OPENAI_API_MODE_AUTO,
                "embedding-key",
                "向量模型",
                true
        ));

        assertThatThrownBy(() -> modelConfigService.invokePrompt(embeddingModel.id(), "system", "user"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Embedding 模型不支持文本生成调用，请选择对话模型");
    }

    /**
     * Responses API 的图片输入必须使用 input_text/input_image，不能复用 Chat Completions 的元素类型。
     */
    @Test
    void shouldBuildOpenAiResponsesVisionPayload() throws IOException {
        AtomicReference<String> requestBody = new AtomicReference<>();
        HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/responses", exchange -> {
            requestBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] responseBody = "{\"output_text\":\"图片说明\",\"usage\":{\"input_tokens\":11,\"output_tokens\":7,\"total_tokens\":18}}"
                    .getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, responseBody.length);
            try (OutputStream outputStream = exchange.getResponseBody()) {
                outputStream.write(responseBody);
            }
        });
        server.start();

        try {
            AiModelConfigSummary model = modelConfigService.createConfig(new AiModelConfigRequest(
                    "本地视觉模型",
                    ModelConfigService.MODEL_TYPE_CHAT,
                    ModelConfigService.PROVIDER_OPENAI,
                    "http://127.0.0.1:" + server.getAddress().getPort(),
                    "vision-model",
                    ModelConfigService.OPENAI_API_MODE_AUTO,
                    "vision-key",
                    "视觉请求测试",
                    true
            ));

            ModelConfigService.ModelInvocation invocation = modelConfigService.invokeVisionPromptWithUsage(
                    modelConfigService.resolveModelConfig(model.id()),
                    "你是图片理解助手",
                    "请描述图片",
                    List.of(new ModelConfigService.VisionImage(1, "image/png", "YWJj", "screen.png")),
                    512
            );

            assertThat(invocation.text()).isEqualTo("图片说明");
            assertThat(invocation.totalTokens()).isEqualTo(18);
            assertThat(requestBody.get()).contains("\"type\":\"input_text\"");
            assertThat(requestBody.get()).contains("\"type\":\"input_image\"");
            assertThat(requestBody.get()).contains("data:image/png;base64,YWJj");
            assertThat(requestBody.get()).doesNotContain("\"type\":\"image_url\"");
        } finally {
            server.stop(0);
        }
    }

    /** Chat Completions 图片输入使用 text/image_url 对象。 */
    @Test
    void shouldBuildOpenAiChatCompletionsVisionPayload() throws IOException {
        AtomicReference<String> requestBody = new AtomicReference<>();
        HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/chat/completions", exchange -> {
            requestBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] responseBody = "{\"choices\":[{\"message\":{\"content\":\"聊天图片说明\"}}],\"usage\":{\"prompt_tokens\":9,\"completion_tokens\":5,\"total_tokens\":14}}"
                    .getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, responseBody.length);
            try (OutputStream outputStream = exchange.getResponseBody()) {
                outputStream.write(responseBody);
            }
        });
        server.start();
        try {
            AiModelConfigSummary model = modelConfigService.createConfig(new AiModelConfigRequest(
                    "Chat 视觉模型", ModelConfigService.MODEL_TYPE_CHAT, ModelConfigService.PROVIDER_OPENAI,
                    "http://127.0.0.1:" + server.getAddress().getPort(), "vision-chat",
                    ModelConfigService.OPENAI_API_MODE_CHAT_COMPLETIONS, "vision-key", "", true));

            ModelConfigService.ModelInvocation invocation = modelConfigService.invokeVisionPromptWithUsage(
                    modelConfigService.resolveModelConfig(model.id()), "系统提示", "描述图片",
                    List.of(new ModelConfigService.VisionImage(1, "image/jpeg", "eHl6", "screen.jpg")), 512);

            assertThat(invocation.text()).isEqualTo("聊天图片说明");
            assertThat(invocation.totalTokens()).isEqualTo(14);
            assertThat(requestBody.get()).contains("\"type\":\"text\"");
            assertThat(requestBody.get()).contains("\"type\":\"image_url\"");
            assertThat(requestBody.get()).contains("\"url\":\"data:image/jpeg;base64,eHl6\"");
            assertThat(requestBody.get()).doesNotContain("input_image");
        } finally {
            server.stop(0);
        }
    }

    /** Anthropic 图片输入使用 image/source/base64 协议。 */
    @Test
    void shouldBuildAnthropicVisionPayload() throws IOException {
        AtomicReference<String> requestBody = new AtomicReference<>();
        HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/messages", exchange -> {
            requestBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] responseBody = "{\"content\":[{\"type\":\"text\",\"text\":\"Anthropic 图片说明\"}],\"usage\":{\"input_tokens\":8,\"output_tokens\":6}}"
                    .getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, responseBody.length);
            try (OutputStream outputStream = exchange.getResponseBody()) {
                outputStream.write(responseBody);
            }
        });
        server.start();
        try {
            AiModelConfigSummary model = modelConfigService.createConfig(new AiModelConfigRequest(
                    "Anthropic 视觉模型", ModelConfigService.MODEL_TYPE_CHAT, ModelConfigService.PROVIDER_ANTHROPIC,
                    "http://127.0.0.1:" + server.getAddress().getPort(), "claude-vision",
                    ModelConfigService.OPENAI_API_MODE_AUTO, "vision-key", "", true));

            ModelConfigService.ModelInvocation invocation = modelConfigService.invokeVisionPromptWithUsage(
                    modelConfigService.resolveModelConfig(model.id()), "系统提示", "描述图片",
                    List.of(new ModelConfigService.VisionImage(1, "image/webp", "d2VicA==", "screen.webp")), 512);

            assertThat(invocation.text()).isEqualTo("Anthropic 图片说明");
            assertThat(invocation.totalTokens()).isEqualTo(14);
            assertThat(requestBody.get()).contains("\"type\":\"image\"");
            assertThat(requestBody.get()).contains("\"type\":\"base64\"");
            assertThat(requestBody.get()).contains("\"media_type\":\"image/webp\"");
            assertThat(requestBody.get()).contains("\"data\":\"d2VicA==\"");
        } finally {
            server.stop(0);
        }
    }
}
