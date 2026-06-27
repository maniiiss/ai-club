package com.aiclub.platform.service;

import com.aiclub.platform.agentusage.AgentInvocationRecorder;
import com.aiclub.platform.domain.model.AiModelConfigEntity;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.dto.ApiTestCaseAiResult;
import com.aiclub.platform.dto.request.ApiTestGenerationRequest;
import com.aiclub.platform.repository.AiModelConfigRepository;
import com.aiclub.platform.service.ApiTestContextSource.ApiTestGenerationContext;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.ArgumentMatchers;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * 数据源通过 {@link ApiTestContextSource} 提供，
 * 行为契约（脱敏 / 模型回退 / 拒绝 Embedding）完全保留。
 */
@ExtendWith(MockitoExtension.class)
class ApiTestCaseAiServiceTests {

    @Mock
    private ApiTestContextSource contextSource;

    @Mock
    private AiModelConfigRepository aiModelConfigRepository;

    @Mock
    private ModelConfigService modelConfigService;

    @Mock
    private AgentInvocationRecorder agentInvocationRecorder;

    private ObjectMapper objectMapper;
    private ApiTestCaseAiService apiTestCaseAiService;

    @BeforeEach
    void setUp() {
        lenient().when(agentInvocationRecorder.track(any(), ArgumentMatchers.<java.util.function.Supplier<Object>>any()))
                .thenAnswer(invocation -> invocation.getArgument(1, java.util.function.Supplier.class).get());
        lenient().when(agentInvocationRecorder.trackWithUsage(any(), ArgumentMatchers.<java.util.function.Function<com.aiclub.platform.agentusage.UsageSink, Object>>any()))
                .thenAnswer(invocation -> {
                    java.util.function.Function<com.aiclub.platform.agentusage.UsageSink, Object> fn = invocation.getArgument(1);
                    return fn.apply(new com.aiclub.platform.agentusage.UsageSink());
                });
        objectMapper = new ObjectMapper();
        apiTestCaseAiService = new ApiTestCaseAiService(
                contextSource,
                aiModelConfigRepository,
                modelConfigService,
                objectMapper,
                agentInvocationRecorder
        );
    }

    @Test
    void shouldFallbackToFirstEnabledChatModel() {
        AiModelConfigEntity chatModel = model(3L, "默认对话模型", ModelConfigService.MODEL_TYPE_CHAT);
        when(contextSource.requireContext(10L, 101L)).thenReturn(context());
        when(aiModelConfigRepository.findAllByEnabledTrueAndModelTypeOrderByIdAsc(ModelConfigService.MODEL_TYPE_CHAT)).thenReturn(List.of(chatModel));
        when(modelConfigService.resolveModelConfig(3L)).thenReturn(resolved(chatModel));
        when(modelConfigService.invokePromptWithUsage(any(ModelConfigService.ResolvedModelConfig.class), anyString(), anyString(), anyInt(), anyBoolean()))
                .thenReturn(new ModelConfigService.ModelInvocation(aiJson(9), null, null, null));

        ApiTestCaseAiResult result = apiTestCaseAiService.generate(10L, 101L, new ApiTestGenerationRequest(null));

        assertThat(result.modelConfigId()).isEqualTo(3L);
        assertThat(result.testCases()).hasSize(8);
        verify(aiModelConfigRepository).findAllByEnabledTrueAndModelTypeOrderByIdAsc(ModelConfigService.MODEL_TYPE_CHAT);
    }

    @Test
    void shouldRejectExplicitEmbeddingModel() {
        AiModelConfigEntity embeddingModel = model(4L, "向量模型", ModelConfigService.MODEL_TYPE_EMBEDDING);
        when(contextSource.requireContext(10L, 101L)).thenReturn(context());
        when(aiModelConfigRepository.findById(4L)).thenReturn(Optional.of(embeddingModel));

        assertThatThrownBy(() -> apiTestCaseAiService.generate(10L, 101L, new ApiTestGenerationRequest(4L)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("API 测试用例 AI 仅支持对话模型配置");

        verifyNoInteractions(modelConfigService);
    }

    /**
     * Prompt 上下文必须脱敏，避免把 token、密码或 API Key 送进模型。
     */
    @Test
    void shouldMaskSecretsBeforeInvokingModel() {
        AiModelConfigEntity chatModel = model(3L, "默认对话模型", ModelConfigService.MODEL_TYPE_CHAT);
        when(contextSource.requireContext(10L, 101L)).thenReturn(context());
        when(aiModelConfigRepository.findAllByEnabledTrueAndModelTypeOrderByIdAsc(ModelConfigService.MODEL_TYPE_CHAT)).thenReturn(List.of(chatModel));
        when(modelConfigService.resolveModelConfig(3L)).thenReturn(resolved(chatModel));
        when(modelConfigService.invokePromptWithUsage(any(ModelConfigService.ResolvedModelConfig.class), anyString(), anyString(), anyInt(), anyBoolean()))
                .thenReturn(new ModelConfigService.ModelInvocation(aiJson(1), null, null, null));

        apiTestCaseAiService.generate(10L, 101L, new ApiTestGenerationRequest(null));

        ArgumentCaptor<String> userPromptCaptor = ArgumentCaptor.forClass(String.class);
        verify(modelConfigService).invokePromptWithUsage(any(ModelConfigService.ResolvedModelConfig.class), anyString(), userPromptCaptor.capture(), anyInt(), anyBoolean());
        assertThat(userPromptCaptor.getValue()).contains("***已脱敏***");
        assertThat(userPromptCaptor.getValue()).doesNotContain("Bearer real-token");
        assertThat(userPromptCaptor.getValue()).doesNotContain("plain-password");
        assertThat(userPromptCaptor.getValue()).doesNotContain("secret-api-key");
    }

    private ApiTestGenerationContext context() {
        ProjectEntity project = new ProjectEntity("CRM项目", "张三", "进行中", "API AI 测试");
        project.setId(10L);
        ObjectNode data = objectMapper.createObjectNode()
                .put("name", "创建用户")
                .put("method", "POST")
                .put("uri", "/api/users")
                .put("description", "创建用户接口")
                .put("contentType", "application/json")
                .put("body", "{\"username\":\"demo\",\"password\":\"plain-password\",\"apiKey\":\"secret-api-key\"}");
        data.putArray("headers")
                .add(objectMapper.createObjectNode().put("key", "Authorization").put("value", "Bearer real-token"))
                .add(objectMapper.createObjectNode().put("key", "X-Trace").put("value", "trace-1"));
        data.set("params", objectMapper.createArrayNode());
        data.set("formDataBody", objectMapper.createArrayNode());
        data.set("auth", objectMapper.createObjectNode());
        return new ApiTestGenerationContext(project, 101L, "CRM项目 / 用户管理", data);
    }

    private AiModelConfigEntity model(Long id, String name, String modelType) {
        AiModelConfigEntity entity = new AiModelConfigEntity();
        entity.setId(id);
        entity.setName(name);
        entity.setModelType(modelType);
        entity.setProvider(ModelConfigService.PROVIDER_OPENAI);
        entity.setApiBaseUrl("https://api.openai.com/v1");
        entity.setModelName("model-" + id);
        entity.setApiKeyCiphertext("cipher-" + id);
        entity.setEnabled(true);
        return entity;
    }

    private ModelConfigService.ResolvedModelConfig resolved(AiModelConfigEntity entity) {
        return new ModelConfigService.ResolvedModelConfig(entity.getId(), entity.getName(), entity.getModelType(), entity.getProvider(), entity.getApiBaseUrl(), entity.getModelName(), ModelConfigService.OPENAI_API_MODE_AUTO, "key");
    }

    private String aiJson(int count) {
        StringBuilder builder = new StringBuilder();
        builder.append("{\"markdown\":\"## 测试设计总览\\n- 覆盖核心接口风险\",\"testCases\":[");
        for (int i = 1; i <= count; i++) {
            if (i > 1) {
                builder.append(',');
            }
            builder.append("{\"title\":\"用例").append(i).append("\",")
                    .append("\"caseType\":\"正向测试\",")
                    .append("\"priority\":\"P1\",")
                    .append("\"precondition\":\"已登录\",")
                    .append("\"requestExample\":\"POST /api/users\",")
                    .append("\"assertions\":[{\"type\":\"STATUS_CODE\",\"target\":\"status\",\"operator\":\"EQ\",\"expected\":\"200\",\"description\":\"成功\"}],")
                    .append("\"riskNotes\":\"无\"}");
        }
        builder.append("]}");
        return builder.toString();
    }
}
