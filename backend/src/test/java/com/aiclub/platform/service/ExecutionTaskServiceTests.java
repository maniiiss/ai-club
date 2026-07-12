package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.AgentEntity;
import com.aiclub.platform.domain.model.ExecutionArtifactEntity;
import com.aiclub.platform.domain.model.ExecutionRunEntity;
import com.aiclub.platform.domain.model.ExecutionStepEntity;
import com.aiclub.platform.domain.model.ExecutionTaskEntity;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.ProjectGitlabBindingEntity;
import com.aiclub.platform.domain.model.TaskEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.ExecutionTaskDetail;
import com.aiclub.platform.dto.ExecutionWorkspaceCleanupSummary;
import com.aiclub.platform.dto.ExecutionTaskSummary;
import com.aiclub.platform.dto.request.ConfirmExecutionPlanRequest;
import com.aiclub.platform.dto.request.CreateExecutionTaskRequest;
import com.aiclub.platform.dto.request.UpdateExecutionPlanMarkdownRequest;
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

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
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

    @Mock
    private SelfUpgradeExecutionWritebackService selfUpgradeExecutionWritebackService;

    @Mock
    private ExecutionWorkspaceCleanupService executionWorkspaceCleanupService;

    @Mock
    private ExecutionTaskQueuePublisher executionTaskQueuePublisher;

    @Mock
    private TechnicalDesignCreditSettlementService technicalDesignCreditSettlementService;

    @Mock
    private ExecutionOrchestrationService executionOrchestrationService;

    @Mock
    private com.aiclub.platform.repository.ExecutionOrchestrationVersionRepository executionOrchestrationVersionRepository;

    @Mock
    private ExecutionContextSnapshotService executionContextSnapshotService;

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
                selfUpgradeExecutionWritebackService,
                executionWorkspaceCleanupService,
                executionTaskQueuePublisher,
                technicalDesignCreditSettlementService,
                executionOrchestrationService,
                executionOrchestrationVersionRepository,
                executionContextSnapshotService,
                new ObjectMapper()
        );
        AuthContextHolder.set(new AuthContext(1001L, "alice", "Alice", Set.of(), Set.of()));

        ProjectEntity project = buildProject();
        lenient().when(projectRepository.findById(11L)).thenReturn(Optional.of(project));
        UserEntity currentUser = new UserEntity();
        currentUser.setId(1001L);
        currentUser.setUsername("alice");
        currentUser.setNickname("Alice");
        lenient().when(userRepository.findById(1001L)).thenReturn(Optional.of(currentUser));
        lenient().when(executionWorkflowService.scenarioName(ExecutionWorkflowService.SCENARIO_DEVELOPMENT_IMPLEMENTATION))
                .thenReturn("开发执行");
    }

    @Test
    void shouldRejectCallerAgentBindingsForManagedScenario() {
        when(executionOrchestrationService.isManagedScenario(ExecutionWorkflowService.SCENARIO_DEVELOPMENT_IMPLEMENTATION))
                .thenReturn(true);
        assertThatThrownBy(() -> executionTaskService.createExecutionTask(new CreateExecutionTaskRequest(
                ExecutionWorkflowService.SCENARIO_DEVELOPMENT_IMPLEMENTATION, 11L, null, null, "PAGE", false,
                List.of(new com.aiclub.platform.dto.request.ExecutionAgentBindingRequest("IMPLEMENT", 9L)),
                Map.of("repositories", List.of(Map.of("bindingId", 1L, "targetBranch", "main")))
        ))).isInstanceOf(IllegalArgumentException.class).hasMessageContaining("不允许指定 Agent");
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
                false,
                List.of(),
                Map.of("inputText", "请联动前后端", "repositories", List.of())
        )))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("开发执行至少需要选择一个 GitLab 仓库");
    }

    /**
     * 需求拆解能力已经收口到需求 AI 助手，新建执行任务时应直接给出迁移提示。
     */
    @Test
    void shouldRejectCreatingRequirementBreakdownExecutionTask() {
        assertThatThrownBy(() -> executionTaskService.createExecutionTask(new CreateExecutionTaskRequest(
                ExecutionWorkflowService.SCENARIO_REQUIREMENT_BREAKDOWN,
                11L,
                null,
                null,
                "PAGE",
                false,
                List.of(),
                Map.of("inputText", "帮我拆需求")
        )))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("创建“需求拆解”执行任务已下线，请改用需求 AI 助手中的“拆解子任务”能力");
    }

    /**
     * 测试设计/评审能力已经收口到需求 AI 助手，新建执行任务时不再暴露该旧场景。
     */
    @Test
    void shouldRejectCreatingTestDesignOrReviewExecutionTask() {
        assertThatThrownBy(() -> executionTaskService.createExecutionTask(new CreateExecutionTaskRequest(
                ExecutionWorkflowService.SCENARIO_TEST_DESIGN_OR_REVIEW,
                11L,
                null,
                null,
                "PAGE",
                false,
                List.of(),
                Map.of("inputText", "帮我补测试设计")
        )))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("创建“测试设计/评审”执行任务已下线，请改用需求 AI 助手中的“生成测试用例”能力");
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
                false,
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
                false,
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
                        new ExecutionWorkflowService.ExecutionStepPlan(1, "REPO_STRUCTURING", "仓库结构化", null, null, null, null),
                        new ExecutionWorkflowService.ExecutionStepPlan(2, "PLAN", "执行规划", buildAgent(11L, AgentExecutionService.ACCESS_BUILT_IN), null, null, null),
                        new ExecutionWorkflowService.ExecutionStepPlan(3, "IMPLEMENT", "开发实现 · group/frontend", buildAgent(12L, AgentExecutionService.ACCESS_BUILT_IN), 1L, "main", "group/frontend"),
                        new ExecutionWorkflowService.ExecutionStepPlan(4, "TEST", "执行测试 · group/frontend", buildAgent(13L, AgentExecutionService.ACCESS_HTTP_API), 1L, "main", "group/frontend"),
                        new ExecutionWorkflowService.ExecutionStepPlan(5, "REPORT", "交付报告", buildAgent(14L, AgentExecutionService.ACCESS_BUILT_IN), null, null, null)
                )
        ));

        assertThatThrownBy(() -> executionTaskService.createExecutionTask(new CreateExecutionTaskRequest(
                ExecutionWorkflowService.SCENARIO_DEVELOPMENT_IMPLEMENTATION,
                11L,
                null,
                null,
                "PAGE",
                false,
                List.of(),
                Map.of("repositories", List.of(Map.of("bindingId", 1L, "targetBranch", "main")))
        )))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("开发实现 · group/frontend 必须绑定可真实执行的 HTTP_API 或 AGENT_RUNTIME 智能体");
    }

    /**
     * 页面发起的开发执行若开启规划确认，创建结果和持久化载荷都应带出明确标记，
     * 便于后续调度在 PLAN 后暂停，并让详情页知道当前任务要走确认闭环。
     */
    @Test
    void shouldPersistPlanConfirmationRequiredForPageDevelopmentTask() {
        ProjectGitlabBindingEntity binding = buildBinding(1L, "group/frontend", "main", true);
        when(projectGitlabBindingRepository.findById(1L)).thenReturn(Optional.of(binding));
        when(executionOrchestrationService.isManagedScenario(ExecutionWorkflowService.SCENARIO_DEVELOPMENT_IMPLEMENTATION)).thenReturn(true);
        when(executionOrchestrationService.resolve(11L, ExecutionWorkflowService.SCENARIO_DEVELOPMENT_IMPLEMENTATION))
                .thenReturn(new ExecutionOrchestrationService.ResolvedOrchestration(88L, List.of()));
        com.aiclub.platform.domain.model.ExecutionOrchestrationVersionEntity orchestrationVersion =
                new com.aiclub.platform.domain.model.ExecutionOrchestrationVersionEntity();
        orchestrationVersion.setId(88L);
        when(executionOrchestrationVersionRepository.getReferenceById(88L)).thenReturn(orchestrationVersion);
        when(executionWorkflowService.serializeBindings(any())).thenReturn("[{\"stepNo\":3,\"stepCode\":\"IMPLEMENT\",\"stepName\":\"开发实现 · group/frontend\",\"agentId\":12,\"agentName\":\"创建时开发智能体\",\"accessType\":\"AGENT_RUNTIME\",\"runtimeType\":\"CODEX_CLI\",\"repositoryBindingId\":1,\"repositoryTargetBranch\":\"main\",\"repositoryDisplayName\":\"group/frontend\",\"timeoutSeconds\":900}]");
        when(executionWorkflowService.buildWorkflow(
                eq(ExecutionWorkflowService.SCENARIO_DEVELOPMENT_IMPLEMENTATION),
                eq(11L),
                anyList(),
                anyList()
        )).thenReturn(new ExecutionWorkflowService.WorkflowPlan(
                ExecutionWorkflowService.SCENARIO_DEVELOPMENT_IMPLEMENTATION,
                "开发执行",
                List.of(
                        new ExecutionWorkflowService.ExecutionStepPlan(1, "REPO_STRUCTURING", "仓库结构化", null, null, null, null),
                        new ExecutionWorkflowService.ExecutionStepPlan(2, "PLAN", "执行规划", buildAgent(11L, AgentExecutionService.ACCESS_BUILT_IN), null, null, null),
                        new ExecutionWorkflowService.ExecutionStepPlan(3, "IMPLEMENT", "开发实现 · group/frontend", buildAgent(12L, AgentExecutionService.ACCESS_AGENT_RUNTIME), 1L, "main", "group/frontend"),
                        new ExecutionWorkflowService.ExecutionStepPlan(4, "TEST", "执行测试 · group/frontend", buildAgent(13L, AgentExecutionService.ACCESS_HTTP_API), 1L, "main", "group/frontend"),
                        new ExecutionWorkflowService.ExecutionStepPlan(5, "REPORT", "交付报告", buildAgent(14L, AgentExecutionService.ACCESS_BUILT_IN), null, null, null)
                )
        ));
        when(executionTaskRepository.save(any(ExecutionTaskEntity.class))).thenAnswer(invocation -> {
            ExecutionTaskEntity entity = invocation.getArgument(0);
            entity.setId(501L);
            return entity;
        });

        ExecutionTaskSummary summary = executionTaskService.createExecutionTask(new CreateExecutionTaskRequest(
                ExecutionWorkflowService.SCENARIO_DEVELOPMENT_IMPLEMENTATION,
                11L,
                null,
                null,
                "PAGE",
                true,
                List.of(),
                Map.of("repositories", List.of(Map.of("bindingId", 1L, "targetBranch", "main")))
        ));

        assertThat(summary.planConfirmationRequired()).isTrue();
        assertThat(summary.planConfirmationPending()).isFalse();
        assertThat(summary.orchestrationVersionId()).isEqualTo(88L);
        assertThat(summary.resolvedBindings()).singleElement().satisfies(item -> {
            assertThat(item.stepCode()).isEqualTo("IMPLEMENT");
            assertThat(item.timeoutSeconds()).isEqualTo(900);
            assertThat(item.repositoryTargetBranch()).isEqualTo("main");
            assertThat(item.agentName()).isEqualTo("创建时开发智能体");
            assertThat(item.accessType()).isEqualTo("AGENT_RUNTIME");
            assertThat(item.runtimeType()).isEqualTo("CODEX_CLI");
        });
        verify(executionTaskRepository).save(argThat(task ->
                String.valueOf(task.getInputPayload()).contains("\"planConfirmationRequired\":true")
        ));
        verify(executionTaskQueuePublisher).publishAfterCommit(501L);
    }

    /**
     * 技术设计执行只能从“任务 / 技术设计”工作项发起，避免需求或开发任务误入设计场景。
     */
    @Test
    void shouldRejectTechnicalDesignExecutionForNonTechnicalDesignWorkItem() {
        TaskEntity workItem = buildWorkItem(77L, "任务", "开发任务");
        when(taskRepository.findById(77L)).thenReturn(Optional.of(workItem));

        assertThatThrownBy(() -> executionTaskService.createTechnicalDesignExecution(77L, new CreateExecutionTaskRequest(
                ExecutionWorkflowService.SCENARIO_TECHNICAL_DESIGN_AUTHORING,
                11L,
                77L,
                null,
                "PAGE",
                false,
                List.of(),
                Map.of("repositories", List.of(Map.of("bindingId", 1L, "targetBranch", "main")))
        )))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("技术设计生成仅支持任务类型为“技术设计”的工作项");
    }

    /**
     * 技术设计任务必须选择明确仓库分支，且三个步骤只能绑定 Codex/Claude CLI Runtime。
     */
    @Test
    void shouldCreateTechnicalDesignExecutionWithNormalizedRepositories() {
        TaskEntity workItem = buildWorkItem(77L, "任务", "技术设计");
        ProjectGitlabBindingEntity binding = buildBinding(1L, "group/backend", "main", true);
        AgentEntity codex = buildAgent(21L, AgentExecutionService.ACCESS_AGENT_RUNTIME);
        codex.setRuntimeType(AgentExecutionService.RUNTIME_CODEX_CLI);
        when(taskRepository.findById(77L)).thenReturn(Optional.of(workItem));
        when(projectGitlabBindingRepository.findById(1L)).thenReturn(Optional.of(binding));
        when(executionWorkflowService.buildWorkflow(
                eq(ExecutionWorkflowService.SCENARIO_TECHNICAL_DESIGN_AUTHORING),
                eq(11L),
                anyList(),
                anyList()
        )).thenReturn(new ExecutionWorkflowService.WorkflowPlan(
                ExecutionWorkflowService.SCENARIO_TECHNICAL_DESIGN_AUTHORING,
                "技术设计生成",
                List.of(
                        new ExecutionWorkflowService.ExecutionStepPlan(1, ExecutionWorkflowService.STEP_CODE_CONTEXT, "代码理解", codex, null, null, null),
                        new ExecutionWorkflowService.ExecutionStepPlan(2, ExecutionWorkflowService.STEP_DESIGN_DRAFT, "方案生成", codex, null, null, null),
                        new ExecutionWorkflowService.ExecutionStepPlan(3, ExecutionWorkflowService.STEP_DESIGN_REVIEW, "设计自检", codex, null, null, null)
                )
        ));
        when(executionTaskRepository.save(any(ExecutionTaskEntity.class))).thenAnswer(invocation -> {
            ExecutionTaskEntity entity = invocation.getArgument(0);
            entity.setId(601L);
            return entity;
        });

        ExecutionTaskSummary summary = executionTaskService.createTechnicalDesignExecution(77L, new CreateExecutionTaskRequest(
                ExecutionWorkflowService.SCENARIO_TECHNICAL_DESIGN_AUTHORING,
                11L,
                77L,
                null,
                "PAGE",
                false,
                List.of(),
                Map.of(
                        "repositories", List.of(Map.of("bindingId", 1L, "targetBranch", " main ")),
                        "preferGitNexus", true,
                        "source", "TECHNICAL_DESIGN_AI"
                )
        ));

        assertThat(summary.scenarioCode()).isEqualTo(ExecutionWorkflowService.SCENARIO_TECHNICAL_DESIGN_AUTHORING);
        verify(executionTaskRepository).save(argThat(task ->
                task.getInputPayload().contains("\"targetBranch\":\"main\"")
                        && task.getInputPayload().contains("\"preferGitNexus\":true")
        ));
        verify(executionTaskQueuePublisher).publishAfterCommit(601L);
    }

    @Test
    void shouldRejectTechnicalDesignScenarioFromGenericExecutionEntry() {
        assertThatThrownBy(() -> executionTaskService.createExecutionTask(new CreateExecutionTaskRequest(
                ExecutionWorkflowService.SCENARIO_TECHNICAL_DESIGN_AUTHORING,
                11L,
                77L,
                null,
                "PAGE",
                false,
                List.of(),
                Map.of()
        )))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("技术设计生成必须使用专用创建接口");
    }

    @Test
    void shouldRejectPublicOnlyUserFromManagementTechnicalDesignEntry() {
        AuthContextHolder.set(new AuthContext(1001L, "alice", "Alice", Set.of("PUBLIC_DEFAULT"), Set.of("task:execution:create")));

        assertThatThrownBy(() -> executionTaskService.createTechnicalDesignExecution(77L, new CreateExecutionTaskRequest(
                ExecutionWorkflowService.SCENARIO_TECHNICAL_DESIGN_AUTHORING,
                11L,
                77L,
                null,
                "PAGE",
                false,
                List.of(),
                Map.of()
        )))
                .isInstanceOf(com.aiclub.platform.exception.ForbiddenException.class)
                .hasMessage("公众端用户必须通过积分结算入口创建技术设计任务");
    }

    /**
     * 执行详情需要直接带出任务级工作区清理摘要，前端才能在不额外查 run 详情的前提下展示保留期提示。
     */
    @Test
    void shouldIncludeWorkspaceCleanupSummaryInTaskDetail() {
        ExecutionTaskEntity executionTask = buildWaitingConfirmationTask(1001L);
        executionTask.setCreatedAt(java.time.LocalDateTime.of(2026, 5, 4, 10, 0));
        executionTask.setUpdatedAt(java.time.LocalDateTime.of(2026, 5, 4, 11, 0));
        when(executionTaskRepository.findById(99L)).thenReturn(Optional.of(executionTask));
        when(executionRunRepository.findAllByExecutionTask_IdOrderByRunNoDescIdDesc(99L))
                .thenReturn(List.of(executionTask.getCurrentRun()));
        when(executionWorkspaceCleanupService.buildTaskSummary(99L, ExecutionWorkflowService.SCENARIO_DEVELOPMENT_IMPLEMENTATION))
                .thenReturn(new ExecutionWorkspaceCleanupSummary(
                true,
                24L,
                "SCHEDULED",
                "SUCCESS",
                "2026-05-05 10:00:00",
                null,
                null,
                null,
                2,
                "本地工作区将在 24 小时后自动删除；如需走 MR，请在保留期内完成处理。"
        ));

        ExecutionTaskDetail detail = executionTaskService.getExecutionTask(99L);

        assertThat(detail.workspaceCleanup()).isNotNull();
        assertThat(detail.workspaceCleanup().status()).isEqualTo("SCHEDULED");
        assertThat(detail.workspaceCleanup().trackedWorkspaceCount()).isEqualTo(2);
    }

    /**
     * 规划确认闭环只允许发起人操作；其他可见用户虽然能打开详情页，也只能只读查看。
     */
    @Test
    void shouldRejectUpdatingPlanMarkdownWhenCurrentUserIsNotRequester() {
        ExecutionTaskEntity executionTask = buildWaitingConfirmationTask(2002L);
        when(executionTaskRepository.findWithExecutionContextById(99L)).thenReturn(Optional.of(executionTask));

        assertThatThrownBy(() -> executionTaskService.updateExecutionPlanMarkdown(
                99L,
                new UpdateExecutionPlanMarkdownRequest("# 新规划")
        ))
                .isInstanceOf(com.aiclub.platform.exception.ForbiddenException.class)
                .hasMessage("只有执行任务发起人可以编辑并确认执行规划");
    }

    /**
     * 保存与确认都必须覆写 PLAN 步骤输出和 Markdown 产物，
     * 确认后任务重新回到待调度态，并在当前线程无事务代理时直接触发继续调度。
     */
    @Test
    void shouldOverwritePlanMarkdownAndScheduleResumeWhenConfirmingPlan() {
        ExecutionTaskEntity executionTask = buildWaitingConfirmationTask(1001L);
        ExecutionRunEntity executionRun = executionTask.getCurrentRun();
        ExecutionStepEntity planStep = buildPlanStep(executionRun, "# 旧规划");
        ExecutionArtifactEntity planArtifact = buildPlanArtifact(executionRun, planStep, "# 旧规划");

        when(executionTaskRepository.findWithExecutionContextById(99L)).thenReturn(Optional.of(executionTask));
        when(executionStepRepository.findAllByRun_IdOrderByStepNoAscIdAsc(301L)).thenReturn(List.of(planStep));
        when(executionArtifactRepository.findFirstByRun_IdAndArtifactTypeAndTitle(301L, "PLAN_MARKDOWN", "执行规划 Markdown"))
                .thenReturn(Optional.of(planArtifact));
        when(executionTaskRepository.save(any(ExecutionTaskEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(executionRunRepository.save(any(ExecutionRunEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(executionStepRepository.save(any(ExecutionStepEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(executionArtifactRepository.save(any(ExecutionArtifactEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(executionRunRepository.findAllByExecutionTask_IdOrderByRunNoDescIdDesc(99L)).thenReturn(List.of(executionRun));

        ExecutionTaskDetail detail = executionTaskService.confirmExecutionPlan(
                99L,
                new ConfirmExecutionPlanRequest("# 新规划\n\n- 先改前端\n- 再改后端")
        );

        assertThat(planStep.getOutputSnapshot()).isEqualTo("# 新规划\n\n- 先改前端\n- 再改后端");
        assertThat(planArtifact.getContentText()).isEqualTo("# 新规划\n\n- 先改前端\n- 再改后端");
        assertThat(executionTask.getStatus()).isEqualTo("PENDING");
        assertThat(detail.planConfirmationPending()).isFalse();
        verify(executionTaskQueuePublisher).publishAfterCommit(99L);
        verify(executionDispatchService, never()).dispatchTaskAsync(99L);
    }

    /**
     * 运行中的执行任务若当前步骤已经进入 live runner，取消时应直接触发停止，
     * 避免页面长时间停留在“运行中”而看不到任何取消结果。
     */
    @Test
    void shouldRequestStoppingCurrentLiveStepWhenCancelingRunningTask() {
        ExecutionTaskEntity executionTask = buildWaitingConfirmationTask(1001L);
        executionTask.setStatus("RUNNING");
        executionTask.setLatestSummary("执行中：开发实现");
        when(executionTaskRepository.findWithExecutionContextById(99L)).thenReturn(Optional.of(executionTask));
        when(executionTaskRepository.save(any(ExecutionTaskEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(executionDispatchService.requestCancelRunningTask(99L)).thenAnswer(invocation -> {
            executionTask.setStatus("CANCELED");
            executionTask.setLatestSummary("执行任务已取消，当前步骤正在停止");
            return true;
        });

        ExecutionTaskSummary summary = executionTaskService.cancelExecutionTask(99L);

        assertThat(summary.status()).isEqualTo("CANCELED");
        assertThat(summary.latestSummary()).contains("当前步骤正在停止");
        verify(executionDispatchService).requestCancelRunningTask(99L);
    }

    /**
     * 待确认态取消同样属于终态收口；如果 structuring / runtime 已经登记过工作区，
     * 这里必须补排 cleanup，避免记录永久停留在 ACTIVE。
     */
    @Test
    void shouldScheduleWorkspaceCleanupWhenCancelingWaitingConfirmationTask() {
        ExecutionTaskEntity executionTask = buildWaitingConfirmationTask(1001L);
        when(executionTaskRepository.findWithExecutionContextById(99L)).thenReturn(Optional.of(executionTask));
        when(executionRunRepository.save(any(ExecutionRunEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(executionTaskRepository.save(any(ExecutionTaskEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(executionArtifactRepository.save(any(ExecutionArtifactEntity.class))).thenAnswer(invocation -> {
            ExecutionArtifactEntity artifact = invocation.getArgument(0);
            artifact.setId(901L);
            return artifact;
        });

        ExecutionTaskSummary summary = executionTaskService.cancelExecutionTask(99L);

        assertThat(summary.status()).isEqualTo("CANCELED");
        verify(executionWorkspaceCleanupService).scheduleCleanupForRun(
                eq(301L),
                eq("CANCELED"),
                any(java.time.LocalDateTime.class)
        );
    }

    /**
     * 已下线场景保留历史查询能力，但不允许再次重试执行，避免重复入口重新暴露。
     */
    @Test
    void shouldRejectRetryingRetiredExecutionScenario() {
        ExecutionTaskEntity executionTask = buildWaitingConfirmationTask(1001L);
        executionTask.setScenarioCode(ExecutionWorkflowService.SCENARIO_REQUIREMENT_BREAKDOWN);
        executionTask.setStatus("FAILED");
        when(executionTaskRepository.findWithExecutionContextById(99L)).thenReturn(Optional.of(executionTask));

        assertThatThrownBy(() -> executionTaskService.retryExecutionTask(99L))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("重试“需求拆解”执行任务已下线，请改用需求 AI 助手中的“拆解子任务”能力");
        verify(executionTaskRepository, never()).save(any(ExecutionTaskEntity.class));
    }

    /**
     * 重试执行任务只负责重新排队并发布 MQ 信号，不再直接提交到本机线程池。
     */
    @Test
    void shouldPublishQueueSignalWhenRetryingExecutionTask() {
        ExecutionTaskEntity executionTask = buildWaitingConfirmationTask(1001L);
        executionTask.setStatus("FAILED");
        when(executionTaskRepository.findWithExecutionContextById(99L)).thenReturn(Optional.of(executionTask));
        when(executionTaskRepository.save(any(ExecutionTaskEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        ExecutionTaskSummary summary = executionTaskService.retryExecutionTask(99L);

        assertThat(summary.status()).isEqualTo("PENDING");
        verify(executionTaskQueuePublisher).publishAfterCommit(99L);
    }

    /**
     * 平台内部入口创建执行任务后也要发布 MQ 信号，避免内部任务继续依赖补偿扫描兜底。
     */
    @Test
    void shouldPublishQueueSignalWhenCreatingInternalExecutionTask() {
        when(executionWorkflowService.buildWorkflow(
                eq(ExecutionWorkflowService.SCENARIO_SELF_UPGRADE_PATROL),
                eq(11L),
                anyList(),
                anyList()
        )).thenReturn(new ExecutionWorkflowService.WorkflowPlan(
                ExecutionWorkflowService.SCENARIO_SELF_UPGRADE_PATROL,
                "自升级巡检",
                List.of(new ExecutionWorkflowService.ExecutionStepPlan(
                        1,
                        ExecutionWorkflowService.STEP_PATROL,
                        "平台巡检",
                        buildAgent(91L, AgentExecutionService.ACCESS_AGENT_RUNTIME),
                        null,
                        null,
                        null
                ))
        ));
        when(executionTaskRepository.save(any(ExecutionTaskEntity.class))).thenAnswer(invocation -> {
            ExecutionTaskEntity entity = invocation.getArgument(0);
            entity.setId(910L);
            return entity;
        });

        ExecutionTaskEntity created = executionTaskService.createInternalExecutionTask(
                new ExecutionTaskService.InternalCreateExecutionTaskCommand(
                        ExecutionWorkflowService.SCENARIO_SELF_UPGRADE_PATROL,
                        11L,
                        null,
                        "夜间巡检",
                        "SELF_UPGRADE_CENTER",
                        "SELF_UPGRADE_PATROL",
                        501L,
                        1001L,
                        false,
                        List.of(),
                        Map.of("runTimeoutSeconds", 1200)
                )
        );

        assertThat(created.getId()).isEqualTo(910L);
        verify(executionTaskQueuePublisher).publishAfterCommit(910L);
    }

    /**
     * 兼容旧任务 Agent 运行入口改为异步创建执行任务，返回 PENDING 的执行任务摘要。
     */
    @Test
    void shouldCreateLegacyExecutionTaskAsQueuedExecutionTask() {
        com.aiclub.platform.domain.model.TaskEntity workItem = new com.aiclub.platform.domain.model.TaskEntity();
        workItem.setId(77L);
        workItem.setName("兼容运行工作项");
        workItem.setWorkItemType("任务");
        workItem.setProject(buildProject());
        workItem.setAgent(buildAgent(88L, AgentExecutionService.ACCESS_HTTP_API));
        when(taskRepository.findById(77L)).thenReturn(Optional.of(workItem));
        when(executionWorkflowService.buildWorkflow(
                eq(ExecutionWorkflowService.SCENARIO_AD_HOC_AGENT_RUN),
                eq(11L),
                anyList(),
                anyList()
        )).thenReturn(new ExecutionWorkflowService.WorkflowPlan(
                ExecutionWorkflowService.SCENARIO_AD_HOC_AGENT_RUN,
                "兼容单次执行",
                List.of(new ExecutionWorkflowService.ExecutionStepPlan(
                        1,
                        ExecutionWorkflowService.STEP_AD_HOC_RUN,
                        "单次执行",
                        buildAgent(88L, AgentExecutionService.ACCESS_HTTP_API),
                        null,
                        null,
                        null
                ))
        ));
        when(executionTaskRepository.save(any(ExecutionTaskEntity.class))).thenAnswer(invocation -> {
            ExecutionTaskEntity entity = invocation.getArgument(0);
            entity.setId(909L);
            return entity;
        });

        ExecutionTaskSummary summary = executionTaskService.createLegacyExecutionTask(77L, "请异步运行");

        assertThat(summary.id()).isEqualTo(909L);
        assertThat(summary.status()).isEqualTo("PENDING");
        verify(executionTaskQueuePublisher).publishAfterCommit(909L);
        verify(executionDispatchService, never()).dispatchTaskNow(909L);
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
        agent.setStatus("在线");
        agent.setEnabled(true);
        agent.setAccessType(accessType);
        agent.setCapability("执行");
        return agent;
    }

    private TaskEntity buildWorkItem(Long id, String workItemType, String taskType) {
        TaskEntity workItem = new TaskEntity();
        workItem.setId(id);
        workItem.setName("技术设计工作项");
        workItem.setWorkItemType(workItemType);
        workItem.setTaskType(taskType);
        workItem.setProject(buildProject());
        return workItem;
    }

    private ExecutionTaskEntity buildWaitingConfirmationTask(Long requesterUserId) {
        UserEntity requester = new UserEntity();
        requester.setId(requesterUserId);
        requester.setUsername("requester-" + requesterUserId);
        requester.setNickname("Requester-" + requesterUserId);

        ExecutionRunEntity executionRun = new ExecutionRunEntity();
        executionRun.setId(301L);
        executionRun.setRunNo(1);
        executionRun.setStatus("WAITING_CONFIRMATION");
        executionRun.setCurrentStepNo(2);

        ExecutionTaskEntity executionTask = new ExecutionTaskEntity();
        executionTask.setId(99L);
        executionTask.setTitle("待确认开发执行");
        executionTask.setScenarioCode(ExecutionWorkflowService.SCENARIO_DEVELOPMENT_IMPLEMENTATION);
        executionTask.setProject(buildProject());
        executionTask.setCreatedByUser(requester);
        executionTask.setStatus("WAITING_CONFIRMATION");
        executionTask.setCurrentRun(executionRun);
        executionTask.setInputPayload("""
                {
                  "inputText": "请确认规划后继续",
                  "planConfirmationRequired": true,
                  "repositories": [
                    {"bindingId": 1, "targetBranch": "main"}
                  ]
                }
                """);
        executionRun.setExecutionTask(executionTask);
        return executionTask;
    }

    private ExecutionStepEntity buildPlanStep(ExecutionRunEntity executionRun, String outputSnapshot) {
        ExecutionStepEntity step = new ExecutionStepEntity();
        step.setId(401L);
        step.setRun(executionRun);
        step.setStepNo(2);
        step.setStepCode("PLAN");
        step.setStepName("执行规划");
        step.setStatus("SUCCESS");
        step.setOutputSnapshot(outputSnapshot);
        return step;
    }

    private ExecutionArtifactEntity buildPlanArtifact(ExecutionRunEntity executionRun,
                                                      ExecutionStepEntity executionStep,
                                                      String contentText) {
        ExecutionArtifactEntity artifact = new ExecutionArtifactEntity();
        artifact.setId(501L);
        artifact.setRun(executionRun);
        artifact.setStep(executionStep);
        artifact.setArtifactType("PLAN_MARKDOWN");
        artifact.setTitle("执行规划 Markdown");
        artifact.setContentText(contentText);
        return artifact;
    }
}
