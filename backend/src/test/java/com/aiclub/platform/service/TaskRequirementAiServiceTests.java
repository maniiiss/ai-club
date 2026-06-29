package com.aiclub.platform.service;

import com.aiclub.platform.agentusage.AgentInvocationRecorder;
import com.aiclub.platform.domain.model.AiModelConfigEntity;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.TaskEntity;
import com.aiclub.platform.dto.TaskRequirementAiResult;
import com.aiclub.platform.dto.request.TaskRequirementAiRequest;
import com.aiclub.platform.repository.AgentRepository;
import com.aiclub.platform.repository.AiModelConfigRepository;
import com.aiclub.platform.repository.TaskRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
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

@ExtendWith(MockitoExtension.class)
class TaskRequirementAiServiceTests {

    @Mock
    private TaskRepository taskRepository;

    @Mock
    private AiModelConfigRepository aiModelConfigRepository;

    @Mock
    private AgentRepository agentRepository;

    @Mock
    private ModelConfigService modelConfigService;

    @Mock
    private ProjectDataPermissionService projectDataPermissionService;

    @Mock
    private AgentInvocationRecorder agentInvocationRecorder;

    private TaskRequirementAiService taskRequirementAiService;

    @BeforeEach
    void setUp() {
        // mock recorder：直接透传 supplier，避免在单元测试里依赖 JPA
        lenient().when(agentInvocationRecorder.track(any(), ArgumentMatchers.<java.util.function.Supplier<Object>>any()))
                .thenAnswer(invocation -> invocation.getArgument(1, java.util.function.Supplier.class).get());
        lenient().when(agentInvocationRecorder.trackWithUsage(any(), ArgumentMatchers.<java.util.function.Function<com.aiclub.platform.agentusage.UsageSink, Object>>any()))
                .thenAnswer(invocation -> {
                    java.util.function.Function<com.aiclub.platform.agentusage.UsageSink, Object> fn = invocation.getArgument(1);
                    return fn.apply(new com.aiclub.platform.agentusage.UsageSink());
                });
        taskRequirementAiService = new TaskRequirementAiService(
                taskRepository,
                aiModelConfigRepository,
                agentRepository,
                modelConfigService,
                new ObjectMapper(),
                projectDataPermissionService,
                agentInvocationRecorder
        );
    }

    /**
     * 显式指定 Embedding 模型时，应在进入 LLM 调用前直接拦截。
     */
    @Test
    void shouldRejectEmbeddingModelWhenRequirementAiUsesExplicitConfig() {
        TaskEntity task = buildRequirementTask();
        AiModelConfigEntity embeddingModel = buildModelConfig(2L, "向量模型", ModelConfigService.MODEL_TYPE_EMBEDDING);
        when(taskRepository.findById(1L)).thenReturn(Optional.of(task));
        when(projectDataPermissionService.currentScopeOrNull()).thenReturn(null);
        when(aiModelConfigRepository.findById(2L)).thenReturn(Optional.of(embeddingModel));

        assertThatThrownBy(() -> taskRequirementAiService.generate(1L, new TaskRequirementAiRequest("STANDARDIZE", 2L)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("需求 AI 助手仅支持对话模型配置");

        verifyNoInteractions(modelConfigService);
    }

    /**
     * 未显式指定模型时，应默认回退到首个已启用的对话模型，而不是误选 Embedding 模型。
     */
    @Test
    void shouldFallbackToFirstEnabledChatModelWhenModelConfigIdMissing() {
        TaskEntity task = buildRequirementTask();
        AiModelConfigEntity chatModel = buildModelConfig(3L, "对话模型", ModelConfigService.MODEL_TYPE_CHAT);
        when(taskRepository.findById(1L)).thenReturn(Optional.of(task));
        when(projectDataPermissionService.currentScopeOrNull()).thenReturn(null);
        when(agentRepository.findFirstByBuiltinCodeAndEnabledTrue(anyString())).thenReturn(Optional.empty());
        when(aiModelConfigRepository.findAllByEnabledTrueAndModelTypeOrderByIdAsc(ModelConfigService.MODEL_TYPE_CHAT))
                .thenReturn(List.of(chatModel));
        when(modelConfigService.resolveModelConfig(3L)).thenReturn(new ModelConfigService.ResolvedModelConfig(
                3L,
                "对话模型",
                ModelConfigService.MODEL_TYPE_CHAT,
                ModelConfigService.PROVIDER_OPENAI,
                "https://api.openai.com/v1",
                "gpt-5.4",
                ModelConfigService.OPENAI_API_MODE_AUTO,
                "chat-key"
        ));
        when(modelConfigService.invokePromptWithUsage(any(ModelConfigService.ResolvedModelConfig.class), anyString(), anyString(), anyInt(), anyBoolean()))
                .thenReturn(new ModelConfigService.ModelInvocation("# 用户故事\n\n补充说明", null, null, null));

        TaskRequirementAiResult result = taskRequirementAiService.generate(1L, new TaskRequirementAiRequest("STANDARDIZE", null));

        assertThat(result.modelConfigId()).isEqualTo(3L);
        assertThat(result.modelConfigName()).isEqualTo("对话模型");
        verify(aiModelConfigRepository).findAllByEnabledTrueAndModelTypeOrderByIdAsc(ModelConfigService.MODEL_TYPE_CHAT);
        verify(modelConfigService).resolveModelConfig(3L);
    }

    private TaskEntity buildRequirementTask() {
        ProjectEntity project = new ProjectEntity("演示项目", "张三", "进行中", "需求 AI 测试");
        TaskEntity task = new TaskEntity();
        task.setId(1L);
        task.setName("优化需求说明");
        task.setWorkItemType("需求");
        task.setStatus("草稿");
        task.setPriority("高");
        task.setDescription("补充 AI 生成能力");
        task.setProject(project);
        return task;
    }

    private AiModelConfigEntity buildModelConfig(Long id, String name, String modelType) {
        AiModelConfigEntity entity = new AiModelConfigEntity();
        entity.setId(id);
        entity.setName(name);
        entity.setModelType(modelType);
        entity.setProvider(ModelConfigService.PROVIDER_OPENAI);
        entity.setModelName("model-" + id);
        entity.setApiBaseUrl("https://api.openai.com/v1");
        entity.setApiKeyCiphertext("cipher-" + id);
        entity.setEnabled(true);
        return entity;
    }
}
