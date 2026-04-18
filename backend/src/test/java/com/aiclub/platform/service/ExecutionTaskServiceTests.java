package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.AgentEntity;
import com.aiclub.platform.domain.model.ExecutionTaskEntity;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.ProjectGitlabBindingEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.request.CreateExecutionTaskRequest;
import com.aiclub.platform.repository.ExecutionArtifactRepository;
import com.aiclub.platform.repository.ExecutionRunRepository;
import com.aiclub.platform.repository.ExecutionStepRepository;
import com.aiclub.platform.repository.ExecutionTaskRepository;
import com.aiclub.platform.repository.ProjectGitlabBindingRepository;
import com.aiclub.platform.repository.ProjectRepository;
import com.aiclub.platform.repository.TaskRepository;
import com.aiclub.platform.repository.UserRepository;
import com.aiclub.platform.security.AuthContext;
import com.aiclub.platform.security.AuthContextHolder;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

/**
 * 验证开发执行任务在创建阶段的多仓输入校验与 Agent 接入方式校验。
 */
@ExtendWith(MockitoExtension.class)
class ExecutionTaskServiceTests {

    @Mock
    private ExecutionTaskRepository executionTaskRepository;

    @Mock
    private ExecutionRunRepository executionRunRepository;

    @Mock
    private ExecutionStepRepository executionStepRepository;

    @Mock
    private ExecutionArtifactRepository executionArtifactRepository;

    @Mock
    private ProjectRepository projectRepository;

    @Mock
    private ProjectGitlabBindingRepository projectGitlabBindingRepository;

    @Mock
    private TaskRepository taskRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private ProjectDataPermissionService projectDataPermissionService;

    @Mock
    private ExecutionWorkflowService executionWorkflowService;

    @Mock
    private ExecutionDispatchService executionDispatchService;

    @Mock
    private ExecutionEventService executionEventService;

    private ExecutionTaskService executionTaskService;

    @BeforeEach
    void setUp() {
        executionTaskService = new ExecutionTaskService(
                executionTaskRepository,
                executionRunRepository,
                executionStepRepository,
                executionArtifactRepository,
                projectRepository,
                projectGitlabBindingRepository,
                taskRepository,
                userRepository,
                projectDataPermissionService,
                executionWorkflowService,
                executionDispatchService,
                executionEventService,
                new ObjectMapper()
        );
        AuthContextHolder.set(new AuthContext(1001L, "alice", "Alice", Set.of(), Set.of()));

        ProjectEntity project = buildProject();
        when(projectRepository.findById(11L)).thenReturn(Optional.of(project));
        UserEntity currentUser = new UserEntity();
        currentUser.setId(1001L);
        currentUser.setUsername("alice");
        currentUser.setNickname("Alice");
        when(userRepository.findById(1001L)).thenReturn(Optional.of(currentUser));
    }

    @AfterEach
    void tearDown() {
        AuthContextHolder.clear();
    }

    /**
     * 开发执行第一版必须显式选择至少一个仓库，不能再沿用旧版仅输入说明的创建方式。
     */
    @Test
    void shouldRejectDevelopmentTaskWhenRepositoriesAreEmpty() {
        assertThatThrownBy(() -> executionTaskService.createExecutionTask(new CreateExecutionTaskRequest(
                ExecutionWorkflowService.SCENARIO_DEVELOPMENT_IMPLEMENTATION,
                11L,
                null,
                null,
                "PAGE",
                List.of(),
                Map.of("inputText", "请联动前后端", "repositories", List.of())
        )))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("开发执行至少需要选择一个 GitLab 仓库");
    }

    /**
     * 同一个任务内不允许重复选择同一 GitLab 绑定，避免多仓编排出现重复仓库。
     */
    @Test
    void shouldRejectDuplicateRepositoriesInDevelopmentPayload() {
        ProjectGitlabBindingEntity binding = buildBinding(1L, "group/frontend", "main", true);
        when(projectGitlabBindingRepository.findById(1L)).thenReturn(Optional.of(binding));

        assertThatThrownBy(() -> executionTaskService.createExecutionTask(new CreateExecutionTaskRequest(
                ExecutionWorkflowService.SCENARIO_DEVELOPMENT_IMPLEMENTATION,
                11L,
                null,
                null,
                "PAGE",
                List.of(),
                Map.of("repositories", List.of(
                        Map.of("bindingId", 1L, "targetBranch", "release/1.0"),
                        Map.of("bindingId", 1L, "targetBranch", "main")
                ))
        )))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("开发执行仓库不允许重复选择同一个 GitLab 绑定");
    }

    /**
     * 每个已选仓库都必须有目标分支，若默认分支缺失且用户未填则应在创建阶段直接拦截。
     */
    @Test
    void shouldRejectRepositoryWhenTargetBranchIsMissing() {
        assertThatThrownBy(() -> executionTaskService.createExecutionTask(new CreateExecutionTaskRequest(
                ExecutionWorkflowService.SCENARIO_DEVELOPMENT_IMPLEMENTATION,
                11L,
                null,
                null,
                "PAGE",
                List.of(),
                Map.of("repositories", List.of(Map.of("bindingId", 1L, "targetBranch", "   ")))
        )))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("开发执行仓库必须填写目标分支");
    }

    /**
     * 开发与测试步骤必须绑定到可真实执行的 Runtime / API Agent，Prompt 类 Agent 不能进入该闭环。
     */
    @Test
    void shouldRejectNonExecutableImplementOrTestAgent() {
        ProjectGitlabBindingEntity binding = buildBinding(1L, "group/frontend", "main", true);
        when(projectGitlabBindingRepository.findById(1L)).thenReturn(Optional.of(binding));
        when(executionWorkflowService.buildWorkflow(
                eq(ExecutionWorkflowService.SCENARIO_DEVELOPMENT_IMPLEMENTATION),
                eq(11L),
                anyList(),
                anyList()
        )).thenReturn(new ExecutionWorkflowService.WorkflowPlan(
                ExecutionWorkflowService.SCENARIO_DEVELOPMENT_IMPLEMENTATION,
                "开发执行",
                List.of(
                        new ExecutionWorkflowService.ExecutionStepPlan(1, "PLAN", "执行规划", buildAgent(11L, AgentExecutionService.ACCESS_BUILT_IN), null, null, null),
                        new ExecutionWorkflowService.ExecutionStepPlan(2, "IMPLEMENT", "开发实现 · group/frontend", buildAgent(12L, AgentExecutionService.ACCESS_BUILT_IN), 1L, "main", "group/frontend"),
                        new ExecutionWorkflowService.ExecutionStepPlan(3, "TEST", "执行测试 · group/frontend", buildAgent(13L, AgentExecutionService.ACCESS_HTTP_API), 1L, "main", "group/frontend"),
                        new ExecutionWorkflowService.ExecutionStepPlan(4, "REPORT", "交付报告", buildAgent(14L, AgentExecutionService.ACCESS_BUILT_IN), null, null, null)
                )
        ));

        assertThatThrownBy(() -> executionTaskService.createExecutionTask(new CreateExecutionTaskRequest(
                ExecutionWorkflowService.SCENARIO_DEVELOPMENT_IMPLEMENTATION,
                11L,
                null,
                null,
                "PAGE",
                List.of(),
                Map.of("repositories", List.of(Map.of("bindingId", 1L, "targetBranch", "main")))
        )))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("开发实现 · group/frontend 必须绑定可真实执行的 HTTP_API 或 AGENT_RUNTIME 智能体");
    }

    private ProjectEntity buildProject() {
        ProjectEntity project = new ProjectEntity("执行中心演示项目", "张三", "进行中", "用于执行任务服务测试");
        project.setId(11L);
        return project;
    }

    private ProjectGitlabBindingEntity buildBinding(Long id, String projectPath, String defaultBranch, boolean enabled) {
        ProjectGitlabBindingEntity binding = new ProjectGitlabBindingEntity();
        binding.setId(id);
        binding.setProject(buildProject());
        binding.setGitlabProjectRef(projectPath);
        binding.setGitlabProjectPath(projectPath);
        binding.setDefaultTargetBranch(defaultBranch);
        binding.setEnabled(enabled);
        return binding;
    }

    private AgentEntity buildAgent(Long id, String accessType) {
        AgentEntity agent = new AgentEntity();
        agent.setId(id);
        agent.setName("测试智能体-" + id);
        agent.setType("执行");
        agent.setCategory("执行");
        agent.setStatus("在线");
        agent.setEnabled(true);
        agent.setAccessType(accessType);
        agent.setCapability("执行");
        return agent;
    }
}
