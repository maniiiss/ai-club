package com.aiclub.platform.service;

import com.aiclub.platform.config.GitPilotCliProperties;
import com.aiclub.platform.domain.model.GitPilotCliAccessTokenEntity;
import com.aiclub.platform.dto.AiModelConfigSummary;
import com.aiclub.platform.repository.GitPilotCliAccessTokenRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** 验证 CLI 模型目录只暴露安全摘要，不把平台模型凭据带出 backend。 */
class GitPilotCliServiceTests {

    @Test
    void shouldExposeOnlyEnabledChatModelSummaries() {
        GitPilotCliProperties properties = new GitPilotCliProperties(true, 600, 5, 30, 900, 180, 4194304, "http://localhost:3000");
        GitPilotCliAccessTokenRepository tokenRepository = mock(GitPilotCliAccessTokenRepository.class);
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        AuthService authService = mock(AuthService.class);
        ModelConfigService modelConfigService = mock(ModelConfigService.class);
        when(modelConfigService.listEnabledOptions(ModelConfigService.MODEL_TYPE_CHAT)).thenReturn(List.of(
                new AiModelConfigSummary(1L, "平台 GPT", "CHAT", "OPENAI", "https://secret.example/v1", "gpt-test", "CHAT_COMPLETIONS", true, "代码模型", true),
                new AiModelConfigSummary(2L, "已停用模型", "CHAT", "OPENAI", "https://secret.example/v1", "disabled", "AUTO", true, "停用", false)
        ));

        GitPilotCliService service = new GitPilotCliService(properties, tokenRepository, redis, new ObjectMapper(), authService, modelConfigService);

        assertThat(service.listModels()).hasSize(1);
        assertThat(service.listModels().get(0).modelName()).isEqualTo("gpt-test");
        assertThat(service.listModels().get(0).description()).isEqualTo("代码模型");
        assertThat(service.listModels().get(0).toString()).doesNotContain("secret.example");
    }
}
