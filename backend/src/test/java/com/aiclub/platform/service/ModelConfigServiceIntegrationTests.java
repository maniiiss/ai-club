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
}
