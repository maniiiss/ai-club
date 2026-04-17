package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.AiModelConfigEntity;
import com.aiclub.platform.dto.request.AgentRequest;
import com.aiclub.platform.repository.AiModelConfigRepository;
import com.aiclub.platform.repository.AgentRepository;
import com.aiclub.platform.repository.IterationRepository;
import com.aiclub.platform.repository.ProjectGitlabBindingRepository;
import com.aiclub.platform.repository.ProjectRepository;
import com.aiclub.platform.repository.TaskCommentRepository;
import com.aiclub.platform.repository.TaskRepository;
import com.aiclub.platform.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PlatformStoreServiceModelConfigTests {

    @Mock
    private ProjectRepository projectRepository;

    @Mock
    private ProjectGitlabBindingRepository projectGitlabBindingRepository;

    @Mock
    private AgentRepository agentRepository;

    @Mock
    private AiModelConfigRepository aiModelConfigRepository;

    @Mock
    private IterationRepository iterationRepository;

    @Mock
    private TaskRepository taskRepository;

    @Mock
    private TaskCommentRepository taskCommentRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private TokenCipherService tokenCipherService;

    @Mock
    private TaskNotificationService taskNotificationService;

    @Mock
    private KnowledgeGraphService knowledgeGraphService;

    @Mock
    private ProjectDataPermissionService projectDataPermissionService;

    private PlatformStoreService platformStoreService;

    @BeforeEach
    void setUp() {
        platformStoreService = new PlatformStoreService(
                projectRepository,
                projectGitlabBindingRepository,
                agentRepository,
                aiModelConfigRepository,
                iterationRepository,
                taskRepository,
                taskCommentRepository,
                userRepository,
                tokenCipherService,
                taskNotificationService,
                knowledgeGraphService,
                projectDataPermissionService
        );
    }

    /**
     * Agent 绑定模型时必须是对话模型，避免 Embedding 模型误入执行链路。
     */
    @Test
    void shouldRejectEmbeddingModelWhenCreatingBuiltInAgent() {
        AiModelConfigEntity embeddingModel = new AiModelConfigEntity();
        embeddingModel.setId(9L);
        embeddingModel.setName("向量模型");
        embeddingModel.setModelType(ModelConfigService.MODEL_TYPE_EMBEDDING);
        embeddingModel.setProvider(ModelConfigService.PROVIDER_OPENAI);
        embeddingModel.setEnabled(true);
        when(aiModelConfigRepository.findById(9L)).thenReturn(Optional.of(embeddingModel));

        AgentRequest request = new AgentRequest(
                "代码审查 Agent",
                "开发",
                "开发",
                "在线",
                true,
                AgentExecutionService.ACCESS_BUILT_IN,
                AgentExecutionService.BUILTIN_CODE_REVIEW,
                "代码审查",
                "用于验证模型类型约束",
                9L,
                "系统提示词",
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                60,
                null
        );

        assertThatThrownBy(() -> platformStoreService.createAgent(request))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("当前 Agent 仅支持绑定对话模型配置");

        verify(aiModelConfigRepository).findById(9L);
        verifyNoInteractions(agentRepository);
    }
}
