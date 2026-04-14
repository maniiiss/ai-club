package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.PlatformToolAuditEntity;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.ProjectGitlabBindingEntity;
import com.aiclub.platform.dto.PlatformToolDefinition;
import com.aiclub.platform.dto.PlatformToolRequest;
import com.aiclub.platform.dto.PlatformToolResult;
import com.aiclub.platform.repository.AgentRepository;
import com.aiclub.platform.repository.ExecutionTaskRepository;
import com.aiclub.platform.repository.IterationRepository;
import com.aiclub.platform.repository.ProjectGitlabBindingRepository;
import com.aiclub.platform.repository.ProjectRepository;
import com.aiclub.platform.repository.TaskRepository;
import com.aiclub.platform.repository.TestPlanRepository;
import com.aiclub.platform.repository.UserRepository;
import com.aiclub.platform.security.AuthContext;
import com.aiclub.platform.security.AuthContextHolder;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Sort;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.when;

/**
 * 验证仓库绑定搜索能从自然语言关键词中抽出 GitLab 路径，避免 Hermes 传整句时误判“未绑定”。
 */
@ExtendWith(MockitoExtension.class)
class PlatformToolExecutorGitlabBindingSearchTests {

    @Mock
    private PlatformToolRegistry platformToolRegistry;

    @Mock
    private ToolExecutionAuditService toolExecutionAuditService;

    @Mock
    private ProjectDataPermissionService projectDataPermissionService;

    @Mock
    private ProjectRepository projectRepository;

    @Mock
    private TaskRepository taskRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private AgentRepository agentRepository;

    @Mock
    private ProjectGitlabBindingRepository projectGitlabBindingRepository;

    @Mock
    private ExecutionTaskRepository executionTaskRepository;

    @Mock
    private TestPlanRepository testPlanRepository;

    @Mock
    private IterationRepository iterationRepository;

    @Mock
    private ExecutionWorkflowService executionWorkflowService;

    @Mock
    private GitlabManagementService gitlabManagementService;

    private PlatformToolExecutor platformToolExecutor;

    @BeforeEach
    void setUp() {
        platformToolExecutor = new PlatformToolExecutor(
                platformToolRegistry,
                toolExecutionAuditService,
                projectDataPermissionService,
                projectRepository,
                taskRepository,
                userRepository,
                agentRepository,
                projectGitlabBindingRepository,
                executionTaskRepository,
                testPlanRepository,
                iterationRepository,
                executionWorkflowService,
                gitlabManagementService
        );
        AuthContextHolder.set(new AuthContext(
                1L,
                "admin",
                "管理员",
                Set.of("SUPER_ADMIN"),
                Set.of("gitlab:view")
        ));
    }

    @AfterEach
    void tearDown() {
        AuthContextHolder.clear();
    }

    /**
     * 即使模型把“项目名 + 仓库路径 + 动作”揉成一个关键词，平台也应该能从中抽出仓库路径并命中绑定。
     */
    @Test
    void shouldMatchGitlabBindingWhenKeywordContainsNaturalLanguageAndRepositoryPath() {
        PlatformToolDefinition definition = new PlatformToolDefinition(
                PlatformToolRegistry.TOOL_GITLAB_BINDING_SEARCH,
                "搜索仓库绑定",
                "GITLAB",
                "按项目名或仓库路径搜索 GitLab 绑定仓库",
                true,
                "LOW",
                "gitlab:view",
                false,
                Map.of("keyword", "仓库关键词", "projectId", "项目ID")
        );
        when(platformToolRegistry.requireDefinition(PlatformToolRegistry.TOOL_GITLAB_BINDING_SEARCH)).thenReturn(definition);
        when(platformToolRegistry.isEnabled(PlatformToolRegistry.TOOL_GITLAB_BINDING_SEARCH)).thenReturn(true);
        when(toolExecutionAuditService.createAudit(any(), any())).thenReturn(new PlatformToolAuditEntity());
        doNothing().when(toolExecutionAuditService).finishSuccess(any(), any());

        ProjectEntity project = new ProjectEntity("Agent Ops", "管理员", "进行中", "用于测试仓库绑定搜索");
        project.setId(1L);
        ProjectGitlabBindingEntity binding = new ProjectGitlabBindingEntity();
        binding.setId(1L);
        binding.setProject(project);
        binding.setGitlabProjectRef("kjez/gjcrm/crm-srv");
        binding.setGitlabProjectPath("kjez/gjcrm/crm-srv");
        binding.setGitlabProjectName("crm-srv");
        binding.setDefaultTargetBranch("deploy");
        when(projectGitlabBindingRepository.findAll(Sort.by(Sort.Direction.ASC, "id"))).thenReturn(List.of(binding));
        doNothing().when(projectDataPermissionService).requireProjectVisible(project);

        PlatformToolResult result = platformToolExecutor.execute(new PlatformToolRequest(
                PlatformToolRegistry.TOOL_GITLAB_BINDING_SEARCH,
                "HERMES",
                "scope-test",
                null,
                null,
                null,
                Map.of("keyword", "Agent Ops 的 kjez/gjcrm/crm-srv 的代码扫描")
        ));

        assertThat(result.candidates()).hasSize(1);
        assertThat(result.candidates().get(0).payload()).containsEntry("bindingId", 1L);
        assertThat(result.summary()).contains("找到 1 个相关仓库");
    }
}
