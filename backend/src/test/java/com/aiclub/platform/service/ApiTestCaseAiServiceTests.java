package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.AiModelConfigEntity;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.dto.ApiTestCaseAiResult;
import com.aiclub.platform.dto.YaadeProjectBindingSummary;
import com.aiclub.platform.dto.request.YaadeApiTestCaseGenerationRequest;
import com.aiclub.platform.repository.AiModelConfigRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ApiTestCaseAiServiceTests {

    @Mock
    private YaadeApiCatalogService yaadeApiCatalogService;

    @Mock
    private AiModelConfigRepository aiModelConfigRepository;

    @Mock
    private ModelConfigService modelConfigService;

    private ObjectMapper objectMapper;
    private ApiTestCaseAiService apiTestCaseAiService;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        apiTestCaseAiService = new ApiTestCaseAiService(
                yaadeApiCatalogService,
                aiModelConfigRepository,
                modelConfigService,
                objectMapper
        );
    }

    /**
     * 未指定模型时，应只从启用的对话模型里取默认项，避免误用 Embedding 配置。
     */
    @Test
    void shouldFallbackToFirstEnabledChatModel() {
        AiModelConfigEntity chatModel = model(3L, "默认对话模型", ModelConfigService.MODEL_TYPE_CHAT);
        when(yaadeApiCatalogService.requireRequest(10L, 101L)).thenReturn(lookup());
        when(aiModelConfigRepository.findAllByEnabledTrueAndModelTypeOrderByIdAsc(ModelConfigService.MODEL_TYPE_CHAT)).thenReturn(List.of(chatModel));
        when(modelConfigService.resolveModelConfig(3L)).thenReturn(resolved(chatModel));
        when(modelConfigService.invokePrompt(any(ModelConfigService.ResolvedModelConfig.class), anyString(), anyString(), anyInt())).thenReturn(aiJson(9));

        ApiTestCaseAiResult result = apiTestCaseAiService.generate(10L, 101L, new YaadeApiTestCaseGenerationRequest(null));

        assertThat(result.modelConfigId()).isEqualTo(3L);
        assertThat(result.testCases()).hasSize(8);
        verify(aiModelConfigRepository).findAllByEnabledTrueAndModelTypeOrderByIdAsc(ModelConfigService.MODEL_TYPE_CHAT);
    }

    /**
     * 显式传入 Embedding 模型时，需要在模型调用前直接拒绝。
     */
    @Test
    void shouldRejectExplicitEmbeddingModel() {
        AiModelConfigEntity embeddingModel = model(4L, "向量模型", ModelConfigService.MODEL_TYPE_EMBEDDING);
        when(yaadeApiCatalogService.requireRequest(10L, 101L)).thenReturn(lookup());
        when(aiModelConfigRepository.findById(4L)).thenReturn(Optional.of(embeddingModel));

        assertThatThrownBy(() -> apiTestCaseAiService.generate(10L, 101L, new YaadeApiTestCaseGenerationRequest(4L)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("API 测试用例 AI 仅支持对话模型配置");

        verifyNoInteractions(modelConfigService);
    }

    /**
     * Prompt 上下文必须脱敏，避免把 Yaade 中保存的 token、密码或 API Key 送进模型。
     */
    @Test
    void shouldMaskSecretsBeforeInvokingModel() {
        AiModelConfigEntity chatModel = model(3L, "默认对话模型", ModelConfigService.MODEL_TYPE_CHAT);
        when(yaadeApiCatalogService.requireRequest(10L, 101L)).thenReturn(lookup());
        when(aiModelConfigRepository.findAllByEnabledTrueAndModelTypeOrderByIdAsc(ModelConfigService.MODEL_TYPE_CHAT)).thenReturn(List.of(chatModel));
        when(modelConfigService.resolveModelConfig(3L)).thenReturn(resolved(chatModel));
        when(modelConfigService.invokePrompt(any(ModelConfigService.ResolvedModelConfig.class), anyString(), anyString(), anyInt())).thenReturn(aiJson(1));

        apiTestCaseAiService.generate(10L, 101L, new YaadeApiTestCaseGenerationRequest(null));

        ArgumentCaptor<String> userPromptCaptor = ArgumentCaptor.forClass(String.class);
        verify(modelConfigService).invokePrompt(any(ModelConfigService.ResolvedModelConfig.class), anyString(), userPromptCaptor.capture(), anyInt());
        assertThat(userPromptCaptor.getValue()).contains("***已脱敏***");
        assertThat(userPromptCaptor.getValue()).doesNotContain("Bearer real-token");
        assertThat(userPromptCaptor.getValue()).doesNotContain("plain-password");
        assertThat(userPromptCaptor.getValue()).doesNotContain("secret-api-key");
    }

    private YaadeApiCatalogService.RequestLookupResult lookup() {
        ProjectEntity project = new ProjectEntity("CRM项目", "张三", "进行中", "API AI 测试");
        project.setId(10L);
        YaadeProjectBindingSummary binding = new YaadeProjectBindingSummary(10L, false, true, 51L, "aiclub-project-10", YaadeProjectSyncService.STATUS_ACTIVE, "CRM项目", null, null);
        YaadeClientService.YaadeRemoteCollection collection = collection();
        YaadeClientService.YaadeRemoteRequest request = request();
        return new YaadeApiCatalogService.RequestLookupResult(project, binding, collection, request, "CRM项目 / 用户管理");
    }

    private YaadeClientService.YaadeRemoteCollection collection() {
        ObjectNode data = objectMapper.createObjectNode().put("name", "用户管理").put("parentId", 51).put("rank", 0);
        data.putArray("groups").add("aiclub-project-10");
        ObjectNode raw = objectMapper.createObjectNode().put("id", 61).put("ownerId", 1).put("version", "1.0.0");
        raw.set("data", data);
        raw.set("requests", objectMapper.createArrayNode());
        raw.set("scripts", objectMapper.createArrayNode());
        return new YaadeClientService.YaadeRemoteCollection(61L, 1L, "1.0.0", "用户管理", 51L, 0, List.of("aiclub-project-10"), raw);
    }

    private YaadeClientService.YaadeRemoteRequest request() {
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
        ObjectNode raw = objectMapper.createObjectNode().put("id", 101).put("collectionId", 61).put("type", "REST").put("version", "1.0.0");
        raw.set("data", data.deepCopy());
        return new YaadeClientService.YaadeRemoteRequest(101L, 61L, "REST", "1.0.0", data, raw);
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
        return new ModelConfigService.ResolvedModelConfig(entity.getId(), entity.getName(), entity.getModelType(), entity.getProvider(), entity.getApiBaseUrl(), entity.getModelName(), "key");
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
