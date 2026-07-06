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

    /**
     * 拆解子任务智能体需要直接产出任务类型，供前端二次确认后写入任务字段。
     */
    @Test
    void shouldParseBreakdownTaskTypeFromAgentOutput() {
        TaskEntity task = buildRequirementTask();
        AiModelConfigEntity chatModel = buildModelConfig(4L, "拆解模型", ModelConfigService.MODEL_TYPE_CHAT);
        when(taskRepository.findById(1L)).thenReturn(Optional.of(task));
        when(projectDataPermissionService.currentScopeOrNull()).thenReturn(null);
        when(aiModelConfigRepository.findById(4L)).thenReturn(Optional.of(chatModel));
        when(modelConfigService.resolveModelConfig(4L)).thenReturn(new ModelConfigService.ResolvedModelConfig(
                4L,
                "拆解模型",
                ModelConfigService.MODEL_TYPE_CHAT,
                ModelConfigService.PROVIDER_OPENAI,
                "https://api.openai.com/v1",
                "gpt-5.4",
                ModelConfigService.OPENAI_API_MODE_AUTO,
                "chat-key"
        ));
        when(modelConfigService.invokePromptWithUsage(any(ModelConfigService.ResolvedModelConfig.class), anyString(), anyString(), anyInt(), anyBoolean()))
                .thenReturn(new ModelConfigService.ModelInvocation("""
                        {
                          "markdown": "## 拆解建议\\n- 完成接口设计",
                          "tasks": [
                            {
                              "name": "完成接口设计",
                              "taskType": "技术设计",
                              "priority": "高",
                              "description": "定义接口字段和错误码。"
                            },
                            {
                              "name": "补充部署脚本",
                              "category": "部署",
                              "priority": "中",
                              "description": "准备发布脚本。"
                            }
                          ]
                        }
                        """, null, null, null));

        TaskRequirementAiResult result = taskRequirementAiService.generate(1L, new TaskRequirementAiRequest("BREAKDOWN", 4L));

        assertThat(result.taskSuggestions()).hasSize(2);
        assertThat(result.taskSuggestions().get(0).taskType()).isEqualTo("技术设计");
        assertThat(result.taskSuggestions().get(1).taskType()).isEqualTo("运维任务");
        verify(modelConfigService).invokePromptWithUsage(any(ModelConfigService.ResolvedModelConfig.class), anyString(), anyString(), anyInt(), anyBoolean());
    }

    /**
     * 测试任务复用需求 AI 测试用例生成链路，但只能执行 TEST_CASES 动作。
     */
    @Test
    void shouldGenerateTestCasesForTestingTask() {
        TaskEntity task = buildTestingTask();
        AiModelConfigEntity chatModel = buildModelConfig(5L, "测试用例模型", ModelConfigService.MODEL_TYPE_CHAT);
        when(taskRepository.findById(1L)).thenReturn(Optional.of(task));
        when(projectDataPermissionService.currentScopeOrNull()).thenReturn(null);
        when(aiModelConfigRepository.findById(5L)).thenReturn(Optional.of(chatModel));
        when(modelConfigService.resolveModelConfig(5L)).thenReturn(new ModelConfigService.ResolvedModelConfig(
                5L,
                "测试用例模型",
                ModelConfigService.MODEL_TYPE_CHAT,
                ModelConfigService.PROVIDER_OPENAI,
                "https://api.openai.com/v1",
                "gpt-5.4",
                ModelConfigService.OPENAI_API_MODE_AUTO,
                "chat-key"
        ));
        when(modelConfigService.invokePromptWithUsage(any(ModelConfigService.ResolvedModelConfig.class), anyString(), anyString(), anyInt(), anyBoolean()))
                .thenReturn(new ModelConfigService.ModelInvocation("""
                        {
                          "markdown": "## 测试用例建议\\n\\n### 功能测试\\n1. 验证登录",
                          "testCases": [
                            {
                              "title": "验证登录",
                              "moduleName": "登录模块",
                              "caseType": "功能测试",
                              "priority": "P1",
                              "precondition": "用户已注册",
                              "remarks": "主流程",
                              "steps": [
                                { "stepNo": 1, "action": "打开登录页", "expectedResult": "页面正常显示" }
                              ]
                            }
                          ]
                        }
                        """, null, null, null));

        TaskRequirementAiResult result = taskRequirementAiService.generate(1L, new TaskRequirementAiRequest("TEST_CASES", 5L));

        assertThat(result.action()).isEqualTo("TEST_CASES");
        assertThat(result.testCaseSuggestions()).hasSize(1);
        assertThat(result.testCaseSuggestions().get(0).title()).isEqualTo("验证登录");
        verify(modelConfigService).invokePromptWithUsage(any(ModelConfigService.ResolvedModelConfig.class), anyString(), anyString(), anyInt(), anyBoolean());
    }

    /**
     * 非测试类任务不能借用测试用例生成入口，避免其它任务类型提前暴露未设计的 AI 能力。
     */
    @Test
    void shouldRejectTestCasesForNonTestingTaskTypes() {
        for (String taskType : List.of("开发任务", "技术设计", "UI设计", "运维任务")) {
            TaskEntity task = buildTask(taskType);
            when(taskRepository.findById(1L)).thenReturn(Optional.of(task));
            when(projectDataPermissionService.currentScopeOrNull()).thenReturn(null);

            assertThatThrownBy(() -> taskRequirementAiService.generate(1L, new TaskRequirementAiRequest("TEST_CASES", 5L)))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessage("仅需求或测试任务支持生成测试用例");
        }

        verifyNoInteractions(modelConfigService);
    }

    /**
     * 需求工作项继续兼容 TEST_CASES，避免历史入口和外部调用失效。
     */
    @Test
    void shouldKeepRequirementTestCasesCompatible() {
        TaskEntity task = buildRequirementTask();
        AiModelConfigEntity chatModel = buildModelConfig(6L, "需求测试用例模型", ModelConfigService.MODEL_TYPE_CHAT);
        when(taskRepository.findById(1L)).thenReturn(Optional.of(task));
        when(projectDataPermissionService.currentScopeOrNull()).thenReturn(null);
        when(aiModelConfigRepository.findById(6L)).thenReturn(Optional.of(chatModel));
        when(modelConfigService.resolveModelConfig(6L)).thenReturn(new ModelConfigService.ResolvedModelConfig(
                6L,
                "需求测试用例模型",
                ModelConfigService.MODEL_TYPE_CHAT,
                ModelConfigService.PROVIDER_OPENAI,
                "https://api.openai.com/v1",
                "gpt-5.4",
                ModelConfigService.OPENAI_API_MODE_AUTO,
                "chat-key"
        ));
        when(modelConfigService.invokePromptWithUsage(any(ModelConfigService.ResolvedModelConfig.class), anyString(), anyString(), anyInt(), anyBoolean()))
                .thenReturn(new ModelConfigService.ModelInvocation("""
                        {
                          "markdown": "## 测试用例建议\\n\\n### 功能测试\\n1. 验证需求主流程",
                          "testCases": [
                            {
                              "title": "验证需求主流程",
                              "moduleName": "需求模块",
                              "caseType": "功能测试",
                              "priority": "P1",
                              "precondition": "需求已提交",
                              "remarks": "兼容历史入口",
                              "steps": [
                                { "stepNo": 1, "action": "执行主流程", "expectedResult": "结果符合需求" }
                              ]
                            }
                          ]
                        }
                        """, null, null, null));

        TaskRequirementAiResult result = taskRequirementAiService.generate(1L, new TaskRequirementAiRequest("TEST_CASES", 6L));

        assertThat(result.testCaseSuggestions()).hasSize(1);
        assertThat(result.testCaseSuggestions().get(0).title()).isEqualTo("验证需求主流程");
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

    private TaskEntity buildTestingTask() {
        TaskEntity requirement = buildRequirementTask();
        requirement.setName("登录需求");
        requirement.setDescription("用户可以使用账号密码登录系统。");
        TaskEntity task = buildTask("测试任务");
        task.setName("登录功能测试");
        task.setDescription("覆盖登录成功、失败和异常场景。");
        task.setRequirementTask(requirement);
        return task;
    }

    private TaskEntity buildTask(String taskType) {
        ProjectEntity project = new ProjectEntity("演示项目", "张三", "进行中", "需求 AI 测试");
        TaskEntity task = new TaskEntity();
        task.setId(1L);
        task.setName(taskType + "工作项");
        task.setWorkItemType("任务");
        task.setTaskType(taskType);
        task.setStatus("待开始");
        task.setPriority("中");
        task.setDescription("任务说明");
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
