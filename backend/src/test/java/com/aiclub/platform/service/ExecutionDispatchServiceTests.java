package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.AgentEntity;
import com.aiclub.platform.domain.model.ExecutionArtifactEntity;
import com.aiclub.platform.domain.model.ExecutionRunEntity;
import com.aiclub.platform.domain.model.ExecutionStepEntity;
import com.aiclub.platform.domain.model.ExecutionTaskEntity;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.TaskEntity;
import com.aiclub.platform.repository.ExecutionArtifactRepository;
import com.aiclub.platform.repository.ExecutionRunRepository;
import com.aiclub.platform.repository.ExecutionStepRepository;
import com.aiclub.platform.repository.ExecutionTaskRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 覆盖执行调度在事务外运行时会用“带上下文抓取”的查询读取执行任务，
 * 避免 DevelopmentExecutionService 再访问 workItem 懒加载代理时报 no Session。
 */
@ExtendWith(MockitoExtension.class)
class ExecutionDispatchServiceTests {

    @Mock
    private ExecutionTaskRepository executionTaskRepository;

    @Mock
    private ExecutionRunRepository executionRunRepository;

    @Mock
    private ExecutionStepRepository executionStepRepository;

    @Mock
    private ExecutionArtifactRepository executionArtifactRepository;

    @Mock
    private ExecutionWorkflowService executionWorkflowService;

    @Mock
    private AgentExecutionService agentExecutionService;

    @Mock
    private ExecutionWritebackService executionWritebackService;

    @Mock
    private NotificationService notificationService;

    @Mock
    private RepositoryScanExecutionService repositoryScanExecutionService;

    @Mock
    private DevelopmentExecutionService developmentExecutionService;

    @Mock
    private TestAutomationExecutionService testAutomationExecutionService;

    @Mock
    private SelfUpgradeExecutionWritebackService selfUpgradeExecutionWritebackService;

    @Mock
    private ExecutionEventService executionEventService;

    @Mock
    private ExecutionAsyncSessionService executionAsyncSessionService;

    @Mock
    private ExecutionWorkspaceCleanupService executionWorkspaceCleanupService;

    private ExecutionDispatchService executionDispatchService;

    @BeforeEach
    void setUp() {
        executionDispatchService = new ExecutionDispatchService(
                executionTaskRepository,
                executionRunRepository,
                executionStepRepository,
                executionArtifactRepository,
                executionWorkflowService,
                agentExecutionService,
                executionWritebackService,
                notificationService,
                repositoryScanExecutionService,
                developmentExecutionService,
                testAutomationExecutionService,
                selfUpgradeExecutionWritebackService,
                executionEventService,
                executionAsyncSessionService,
                executionWorkspaceCleanupService,
                Runnable::run
        );
    }

    /**
     * 调度入口应复用带 fetch context 的仓储方法；如果继续走普通 findById，
     * 在异步线程里把 workItem 传给多仓开发执行器时就会再次踩到懒加载异常。
     */
    @Test
    void shouldLoadExecutionTaskWithContextBeforeDispatchingDevelopmentTask() {
        ExecutionTaskEntity executionTask = buildExecutionTask();

        ExecutionWorkflowService.WorkflowPlan workflowPlan = new ExecutionWorkflowService.WorkflowPlan(
                ExecutionWorkflowService.SCENARIO_DEVELOPMENT_IMPLEMENTATION,
                "开发执行",
                List.of(
                        new ExecutionWorkflowService.ExecutionStepPlan(1, "PLAN", "执行规划", buildAgent(11L), null, null, null),
                        new ExecutionWorkflowService.ExecutionStepPlan(2, "IMPLEMENT", "开发实现 · demo/repo", buildAgent(12L), 1L, "main", "demo/repo"),
                        new ExecutionWorkflowService.ExecutionStepPlan(3, "TEST", "执行测试 · demo/repo", buildAgent(13L), 1L, "main", "demo/repo"),
                        new ExecutionWorkflowService.ExecutionStepPlan(4, "REPORT", "交付报告", buildAgent(14L), null, null, null)
                )
        );

        when(executionTaskRepository.findWithExecutionContextById(99L)).thenReturn(Optional.of(executionTask));
        when(executionRunRepository.countByExecutionTask_Id(99L)).thenReturn(0L);
        when(executionRunRepository.save(any(ExecutionRunEntity.class))).thenAnswer(invocation -> {
            ExecutionRunEntity run = invocation.getArgument(0);
            if (run.getId() == null) {
                run.setId(301L);
            }
            return run;
        });
        when(executionTaskRepository.save(any(ExecutionTaskEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(executionWorkflowService.restoreWorkflow(
                eq(ExecutionWorkflowService.SCENARIO_DEVELOPMENT_IMPLEMENTATION),
                eq(7L),
                eq("[]")
        )).thenReturn(workflowPlan);
        when(developmentExecutionService.executeDevelopmentTask(eq(executionTask), any(ExecutionRunEntity.class), eq(workflowPlan)))
                .thenAnswer(invocation -> {
                    // 这里直接访问 workItem 名称，模拟开发执行器真实读取工作项上下文。
                    assertThat(invocation.<ExecutionTaskEntity>getArgument(0).getWorkItem().getName()).isEqualTo("修复执行中心懒加载");
                    return new DevelopmentExecutionService.DevelopmentExecutionResult("开发执行已完成", List.of(), false, false);
                });
        when(executionArtifactRepository.save(any(ExecutionArtifactEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        ExecutionRunEntity result = executionDispatchService.dispatchTaskNow(99L);

        assertThat(result.getStatus()).isEqualTo("SUCCESS");
        verify(executionTaskRepository, never()).findById(99L);
        verify(executionTaskRepository, atLeastOnce()).findWithExecutionContextById(99L);
        verify(developmentExecutionService).executeDevelopmentTask(eq(executionTask), any(ExecutionRunEntity.class), eq(workflowPlan));
    }

    /**
     * 自动化测试场景应直接走专用执行器，而不是回落到通用串行链路。
     */
    @Test
    void shouldDispatchTestAutomationScenarioToSpecializedService() {
        ExecutionTaskEntity executionTask = buildExecutionTask();
        executionTask.setScenarioCode(ExecutionWorkflowService.SCENARIO_TEST_AUTOMATION);

        ExecutionWorkflowService.WorkflowPlan workflowPlan = new ExecutionWorkflowService.WorkflowPlan(
                ExecutionWorkflowService.SCENARIO_TEST_AUTOMATION,
                "自动化测试",
                List.of(
                        new ExecutionWorkflowService.ExecutionStepPlan(1, "PLAN", "自动化规划", null, null, null, null),
                        new ExecutionWorkflowService.ExecutionStepPlan(2, "IMPLEMENT", "生成脚本", null, null, null, null),
                        new ExecutionWorkflowService.ExecutionStepPlan(3, "TEST", "执行自动化", null, null, null, null),
                        new ExecutionWorkflowService.ExecutionStepPlan(4, "REPORT", "结果回写", null, null, null, null)
                )
        );

        when(executionTaskRepository.findWithExecutionContextById(99L)).thenReturn(Optional.of(executionTask));
        when(executionRunRepository.countByExecutionTask_Id(99L)).thenReturn(0L);
        when(executionRunRepository.save(any(ExecutionRunEntity.class))).thenAnswer(invocation -> {
            ExecutionRunEntity run = invocation.getArgument(0);
            if (run.getId() == null) {
                run.setId(701L);
            }
            return run;
        });
        when(executionTaskRepository.save(any(ExecutionTaskEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(executionWorkflowService.restoreWorkflow(
                eq(ExecutionWorkflowService.SCENARIO_TEST_AUTOMATION),
                eq(7L),
                eq("[]")
        )).thenReturn(workflowPlan);
        when(testAutomationExecutionService.executeAutomationTask(eq(executionTask), any(ExecutionRunEntity.class), eq(workflowPlan)))
                .thenReturn(new TestAutomationExecutionService.TestAutomationExecutionResult("自动化执行完成", List.of(), false));
        when(executionArtifactRepository.save(any(ExecutionArtifactEntity.class))).thenAnswer(invocation -> {
            ExecutionArtifactEntity artifact = invocation.getArgument(0);
            artifact.setId(990L);
            return artifact;
        });

        ExecutionRunEntity result = executionDispatchService.dispatchTaskNow(99L);

        assertThat(result.getStatus()).isEqualTo("SUCCESS");
        verify(testAutomationExecutionService).executeAutomationTask(eq(executionTask), any(ExecutionRunEntity.class), eq(workflowPlan));
        verify(agentExecutionService, never()).runAgent(anyLong(), any(), any());
    }

    /**
     * 成功收口时生成的 run 级“最终摘要”产物不归属于具体步骤，
     * 也应该补发 artifact_ready 事件，保证详情页在运行结束瞬间就能刷新产物区。
     */
    @Test
    void shouldEmitArtifactReadyForRunLevelSummaryArtifactOnSuccess() {
        ExecutionTaskEntity executionTask = buildExecutionTask();
        ExecutionRunEntity executionRun = new ExecutionRunEntity();
        executionRun.setId(301L);
        executionRun.setExecutionTask(executionTask);
        executionRun.setOutputSummary("开发执行已完成");

        when(executionRunRepository.save(any(ExecutionRunEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(executionTaskRepository.save(any(ExecutionTaskEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(executionArtifactRepository.save(any(ExecutionArtifactEntity.class))).thenAnswer(invocation -> {
            ExecutionArtifactEntity artifact = invocation.getArgument(0);
            artifact.setId(901L);
            return artifact;
        });

        executionDispatchService.finishSuccess(executionTask, executionRun, new java.util.ArrayList<>());

        verify(executionEventService).recordArtifactReady(executionTask, executionRun, null, 901L, "最终摘要");
    }

    /**
     * run 进入成功终态后，应立即把该次执行登记过的工作区切到待清理队列，
     * 避免前端看起来已完成，但异步 runner 工作区因为没人排期而长期残留在宿主机上。
     */
    @Test
    void shouldScheduleWorkspaceCleanupWhenExecutionSucceeds() {
        ExecutionTaskEntity executionTask = buildExecutionTask();
        ExecutionRunEntity executionRun = new ExecutionRunEntity();
        executionRun.setId(308L);
        executionRun.setExecutionTask(executionTask);
        executionRun.setOutputSummary("开发执行已完成");

        when(executionRunRepository.save(any(ExecutionRunEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(executionTaskRepository.save(any(ExecutionTaskEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(executionArtifactRepository.save(any(ExecutionArtifactEntity.class))).thenAnswer(invocation -> {
            ExecutionArtifactEntity artifact = invocation.getArgument(0);
            artifact.setId(908L);
            return artifact;
        });

        executionDispatchService.finishSuccess(executionTask, executionRun, new java.util.ArrayList<>());

        verify(executionWorkspaceCleanupService).scheduleCleanupForRun(
                eq(308L),
                eq("SUCCESS"),
                any(java.time.LocalDateTime.class)
        );
    }

    /**
     * 开发执行成功后应给发起人补一条站内通知，方便用户直接从消息中心回到执行详情并继续提交 MR。
     */
    @Test
    void shouldNotifyRequesterWhenDevelopmentExecutionSucceeds() {
        ExecutionTaskEntity executionTask = buildExecutionTask();
        executionTask.setCreatedByUser(buildUser(77L, "发起人甲"));
        ExecutionRunEntity executionRun = new ExecutionRunEntity();
        executionRun.setId(303L);
        executionRun.setExecutionTask(executionTask);
        executionRun.setOutputSummary("开发执行已完成，共处理 2 个仓库。");

        when(executionRunRepository.save(any(ExecutionRunEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(executionTaskRepository.save(any(ExecutionTaskEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(executionArtifactRepository.save(any(ExecutionArtifactEntity.class))).thenAnswer(invocation -> {
            ExecutionArtifactEntity artifact = invocation.getArgument(0);
            artifact.setId(903L);
            return artifact;
        });

        executionDispatchService.finishSuccess(executionTask, executionRun, new java.util.ArrayList<>());

        verify(notificationService).sendToUser(
                eq(77L),
                eq(NotificationService.TYPE_TASK),
                eq(NotificationService.LEVEL_SUCCESS),
                eq("开发执行已完成：开发执行任务"),
                org.mockito.ArgumentMatchers.contains("可前往执行详情查看产物，并在右上角直接提交 MR"),
                eq("/tasks/99"),
                eq("DEVELOPMENT_EXECUTION_COMPLETED"),
                eq(99L)
        );
    }

    /**
     * 开发执行失败同样需要通知发起人，避免用户只能手动刷新执行详情页确认失败原因。
     */
    @Test
    void shouldNotifyRequesterWhenDevelopmentExecutionFails() {
        ExecutionTaskEntity executionTask = buildExecutionTask();
        executionTask.setCreatedByUser(buildUser(78L, "发起人乙"));
        executionTask.setTitle("开发失败任务");
        ExecutionRunEntity executionRun = new ExecutionRunEntity();
        executionRun.setId(304L);
        executionRun.setExecutionTask(executionTask);
        executionRun.setOutputSummary("2 个仓库中 1 个执行失败。");

        ExecutionStepEntity failedStep = new ExecutionStepEntity();
        failedStep.setId(601L);
        failedStep.setRun(executionRun);
        failedStep.setStepName("开发实现 · demo/repo");

        when(executionRunRepository.save(any(ExecutionRunEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(executionStepRepository.save(any(ExecutionStepEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(executionTaskRepository.save(any(ExecutionTaskEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(executionArtifactRepository.save(any(ExecutionArtifactEntity.class))).thenAnswer(invocation -> {
            ExecutionArtifactEntity artifact = invocation.getArgument(0);
            artifact.setId(904L);
            return artifact;
        });

        executionDispatchService.finishFailed(
                executionTask,
                executionRun,
                failedStep,
                new IllegalStateException("开发实现失败，测试未通过"),
                new java.util.ArrayList<>()
        );

        verify(notificationService).sendToUser(
                eq(78L),
                eq(NotificationService.TYPE_TASK),
                eq(NotificationService.LEVEL_ERROR),
                eq("开发执行失败：开发失败任务"),
                org.mockito.ArgumentMatchers.contains("开发实现失败，测试未通过"),
                eq("/tasks/99"),
                eq("DEVELOPMENT_EXECUTION_FAILED"),
                eq(99L)
        );
    }

    /**
     * 规划确认模式下，PLAN 完成后调度层不应直接 finishSuccess，而应保留当前 run 并提醒发起人进入详情确认。
     */
    @Test
    void shouldPauseDevelopmentExecutionAfterPlanWhenAwaitingConfirmation() {
        ExecutionTaskEntity executionTask = buildExecutionTask();
        executionTask.setCreatedByUser(buildUser(88L, "确认人"));
        ExecutionWorkflowService.WorkflowPlan workflowPlan = new ExecutionWorkflowService.WorkflowPlan(
                ExecutionWorkflowService.SCENARIO_DEVELOPMENT_IMPLEMENTATION,
                "开发执行",
                List.of(
                        new ExecutionWorkflowService.ExecutionStepPlan(1, "PLAN", "执行规划", buildAgent(11L), null, null, null),
                        new ExecutionWorkflowService.ExecutionStepPlan(2, "IMPLEMENT", "开发实现 · demo/repo", buildAgent(12L), 1L, "main", "demo/repo"),
                        new ExecutionWorkflowService.ExecutionStepPlan(3, "TEST", "执行测试 · demo/repo", buildAgent(13L), 1L, "main", "demo/repo"),
                        new ExecutionWorkflowService.ExecutionStepPlan(4, "REPORT", "交付报告", buildAgent(14L), null, null, null)
                )
        );

        when(executionTaskRepository.findWithExecutionContextById(99L)).thenReturn(Optional.of(executionTask));
        when(executionRunRepository.countByExecutionTask_Id(99L)).thenReturn(0L);
        when(executionRunRepository.save(any(ExecutionRunEntity.class))).thenAnswer(invocation -> {
            ExecutionRunEntity run = invocation.getArgument(0);
            if (run.getId() == null) {
                run.setId(304L);
            }
            return run;
        });
        when(executionTaskRepository.save(any(ExecutionTaskEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(executionWorkflowService.restoreWorkflow(
                eq(ExecutionWorkflowService.SCENARIO_DEVELOPMENT_IMPLEMENTATION),
                eq(7L),
                eq("[]")
        )).thenReturn(workflowPlan);
        when(developmentExecutionService.executeDevelopmentTask(eq(executionTask), any(ExecutionRunEntity.class), eq(workflowPlan)))
                .thenReturn(new DevelopmentExecutionService.DevelopmentExecutionResult(
                        "执行规划已生成，等待发起人确认",
                        List.of(),
                        false,
                        true
                ));

        ExecutionRunEntity result = executionDispatchService.dispatchTaskNow(99L);

        assertThat(result.getStatus()).isEqualTo("RUNNING");
        verify(notificationService).sendToUser(
                eq(88L),
                eq(NotificationService.TYPE_TASK),
                eq(NotificationService.LEVEL_INFO),
                eq("开发执行待确认：开发执行任务"),
                eq("执行规划已生成，请前往执行详情查看、编辑并确认继续。"),
                eq("/tasks/99"),
                eq("DEVELOPMENT_EXECUTION_PLAN_CONFIRM"),
                eq(99L)
        );
        verify(executionWritebackService, never()).writeBackToWorkItem(any(), any(), any());
    }

    /**
     * 取消入口命中当前 live step 时，应委托异步会话服务立即把它收敛到取消态。
     */
    @Test
    void shouldCancelCurrentLiveStepWhenRequestingRunningTaskCancel() {
        ExecutionTaskEntity executionTask = buildExecutionTask();
        ExecutionRunEntity executionRun = new ExecutionRunEntity();
        executionRun.setId(306L);
        executionRun.setExecutionTask(executionTask);
        executionRun.setCurrentStepNo(3);
        executionTask.setCurrentRun(executionRun);

        ExecutionStepEntity currentStep = new ExecutionStepEntity();
        currentStep.setId(601L);
        currentStep.setRun(executionRun);
        currentStep.setStepNo(3);
        currentStep.setStatus("RUNNING");
        currentStep.setHasLiveStream(true);
        currentStep.setRunnerSessionId("session-306");

        when(executionTaskRepository.findWithExecutionContextById(99L)).thenReturn(Optional.of(executionTask));
        when(executionStepRepository.findByRun_IdAndStepNo(306L, 3)).thenReturn(Optional.of(currentStep));
        when(executionAsyncSessionService.cancelLiveStep(
                executionTask,
                executionRun,
                currentStep,
                "执行任务已取消，当前步骤正在停止"
        )).thenReturn(true);

        boolean canceled = executionDispatchService.requestCancelRunningTask(99L);

        assertThat(canceled).isTrue();
        verify(executionAsyncSessionService).cancelLiveStep(
                executionTask,
                executionRun,
                currentStep,
                "执行任务已取消，当前步骤正在停止"
        );
    }

    /**
     * 发起人确认后，任务会重新回到 PENDING 并复用原 run 继续执行；
     * 调度层此时不能再 createRun，否则会把确认前后的轨迹拆成两次运行。
     */
    @Test
    void shouldResumeExistingWaitingConfirmationRunWithoutCreatingNewRun() {
        ExecutionTaskEntity executionTask = buildExecutionTask();
        ExecutionRunEntity waitingRun = new ExecutionRunEntity();
        waitingRun.setId(305L);
        waitingRun.setExecutionTask(executionTask);
        waitingRun.setRunNo(1);
        waitingRun.setStatus("WAITING_CONFIRMATION");
        executionTask.setCurrentRun(waitingRun);
        executionTask.setStatus("PENDING");

        ExecutionWorkflowService.WorkflowPlan workflowPlan = new ExecutionWorkflowService.WorkflowPlan(
                ExecutionWorkflowService.SCENARIO_DEVELOPMENT_IMPLEMENTATION,
                "开发执行",
                List.of(
                        new ExecutionWorkflowService.ExecutionStepPlan(1, "PLAN", "执行规划", buildAgent(11L), null, null, null),
                        new ExecutionWorkflowService.ExecutionStepPlan(2, "IMPLEMENT", "开发实现 · demo/repo", buildAgent(12L), 1L, "main", "demo/repo"),
                        new ExecutionWorkflowService.ExecutionStepPlan(3, "TEST", "执行测试 · demo/repo", buildAgent(13L), 1L, "main", "demo/repo"),
                        new ExecutionWorkflowService.ExecutionStepPlan(4, "REPORT", "交付报告", buildAgent(14L), null, null, null)
                )
        );

        when(executionTaskRepository.findWithExecutionContextById(99L)).thenReturn(Optional.of(executionTask));
        when(executionRunRepository.save(any(ExecutionRunEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(executionTaskRepository.save(any(ExecutionTaskEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(executionWorkflowService.restoreWorkflow(
                eq(ExecutionWorkflowService.SCENARIO_DEVELOPMENT_IMPLEMENTATION),
                eq(7L),
                eq("[]")
        )).thenReturn(workflowPlan);
        when(developmentExecutionService.executeDevelopmentTask(eq(executionTask), eq(waitingRun), eq(workflowPlan)))
                .thenReturn(new DevelopmentExecutionService.DevelopmentExecutionResult("恢复后执行完成", List.of(), false, false));
        when(executionArtifactRepository.save(any(ExecutionArtifactEntity.class))).thenAnswer(invocation -> {
            ExecutionArtifactEntity artifact = invocation.getArgument(0);
            if (artifact.getId() == null) {
                artifact.setId(905L);
            }
            return artifact;
        });

        ExecutionRunEntity result = executionDispatchService.dispatchTaskNow(99L);

        assertThat(result.getId()).isEqualTo(305L);
        verify(executionRunRepository, never()).countByExecutionTask_Id(99L);
        verify(developmentExecutionService).executeDevelopmentTask(eq(executionTask), eq(waitingRun), eq(workflowPlan));
    }

    /**
     * 通用串行链路下的 AD_HOC_RUN 若绑定 CLI Runtime，但当前步骤不走异步流式，
     * 仍应通过 runAgent 直接执行，保证兼容单次运行场景不被新版 runtime 分流逻辑打断。
     */
    @Test
    void shouldRunCliRuntimeAdHocStepSynchronouslyInGenericWorkflow() {
        ExecutionTaskEntity executionTask = buildExecutionTask();
        executionTask.setScenarioCode(ExecutionWorkflowService.SCENARIO_AD_HOC_AGENT_RUN);
        executionTask.setTitle("兼容单次运行任务");
        AgentEntity cliAgent = buildCliRuntimeAgent(21L, AgentExecutionService.RUNTIME_CLAUDE_CODE_CLI);
        ExecutionWorkflowService.WorkflowPlan workflowPlan = new ExecutionWorkflowService.WorkflowPlan(
                ExecutionWorkflowService.SCENARIO_AD_HOC_AGENT_RUN,
                "兼容单次执行",
                List.of(new ExecutionWorkflowService.ExecutionStepPlan(
                        1,
                        ExecutionWorkflowService.STEP_AD_HOC_RUN,
                        "兼容执行",
                        cliAgent,
                        null,
                        null,
                        null
                ))
        );

        when(executionTaskRepository.findWithExecutionContextById(99L)).thenReturn(Optional.of(executionTask));
        when(executionRunRepository.countByExecutionTask_Id(99L)).thenReturn(0L);
        when(executionRunRepository.save(any(ExecutionRunEntity.class))).thenAnswer(invocation -> {
            ExecutionRunEntity run = invocation.getArgument(0);
            if (run.getId() == null) {
                run.setId(401L);
            }
            return run;
        });
        when(executionTaskRepository.save(any(ExecutionTaskEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(executionStepRepository.save(any(ExecutionStepEntity.class))).thenAnswer(invocation -> {
            ExecutionStepEntity step = invocation.getArgument(0);
            if (step.getId() == null) {
                step.setId(501L);
            }
            return step;
        });
        when(executionArtifactRepository.save(any(ExecutionArtifactEntity.class))).thenAnswer(invocation -> {
            ExecutionArtifactEntity artifact = invocation.getArgument(0);
            if (artifact.getId() == null) {
                artifact.setId(951L);
            }
            return artifact;
        });
        when(executionWorkflowService.restoreWorkflow(
                eq(ExecutionWorkflowService.SCENARIO_AD_HOC_AGENT_RUN),
                eq(7L),
                eq("[]")
        )).thenReturn(workflowPlan);
        when(executionWorkflowService.buildStepInput(any(), any(), any(), any(), any()))
                .thenReturn("请执行一次兼容单次运行");
        when(agentExecutionService.supportsAsyncExecution(cliAgent, ExecutionWorkflowService.STEP_AD_HOC_RUN))
                .thenReturn(false);
        when(agentExecutionService.runAgent(
                eq(21L),
                eq("请执行一次兼容单次运行"),
                any()
        )).thenReturn("""
                ## 执行结果

                已完成兼容单次运行
                """);

        ExecutionRunEntity result = executionDispatchService.dispatchTaskNow(99L);

        assertThat(result.getStatus()).isEqualTo("SUCCESS");
        assertThat(result.getOutputSummary()).contains("已完成兼容单次运行");
        verify(agentExecutionService).runAgent(eq(21L), eq("请执行一次兼容单次运行"), any());
        verify(agentExecutionService, never()).startAsyncExecution(any(), any(), any(), anyInt(), anyInt());
        verify(executionAsyncSessionService, never()).bindRunnerSession(any(), any(), any(), any(), any(), any());
    }

    /**
     * 当 AD_HOC_RUN 绑定 CLI Runtime 且支持异步流式执行时，
     * 调度层应绑定 runner session 并等待统一回调收口，而不是退回旧同步执行路径。
     */
    @Test
    void shouldRunCliRuntimeAdHocStepAsynchronouslyInGenericWorkflow() {
        ExecutionTaskEntity executionTask = buildExecutionTask();
        executionTask.setScenarioCode(ExecutionWorkflowService.SCENARIO_AD_HOC_AGENT_RUN);
        executionTask.setTitle("兼容单次运行任务");
        AgentEntity cliAgent = buildCliRuntimeAgent(22L, AgentExecutionService.RUNTIME_CODEX_CLI);
        ExecutionWorkflowService.WorkflowPlan workflowPlan = new ExecutionWorkflowService.WorkflowPlan(
                ExecutionWorkflowService.SCENARIO_AD_HOC_AGENT_RUN,
                "兼容单次执行",
                List.of(new ExecutionWorkflowService.ExecutionStepPlan(
                        1,
                        ExecutionWorkflowService.STEP_AD_HOC_RUN,
                        "兼容执行",
                        cliAgent,
                        null,
                        null,
                        null
                ))
        );

        when(executionTaskRepository.findWithExecutionContextById(99L)).thenReturn(Optional.of(executionTask));
        when(executionRunRepository.countByExecutionTask_Id(99L)).thenReturn(0L);
        when(executionRunRepository.save(any(ExecutionRunEntity.class))).thenAnswer(invocation -> {
            ExecutionRunEntity run = invocation.getArgument(0);
            if (run.getId() == null) {
                run.setId(402L);
            }
            return run;
        });
        when(executionTaskRepository.save(any(ExecutionTaskEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(executionStepRepository.save(any(ExecutionStepEntity.class))).thenAnswer(invocation -> {
            ExecutionStepEntity step = invocation.getArgument(0);
            if (step.getId() == null) {
                step.setId(502L);
            }
            return step;
        });
        when(executionArtifactRepository.save(any(ExecutionArtifactEntity.class))).thenAnswer(invocation -> {
            ExecutionArtifactEntity artifact = invocation.getArgument(0);
            if (artifact.getId() == null) {
                artifact.setId(952L);
            }
            return artifact;
        });
        when(executionWorkflowService.restoreWorkflow(
                eq(ExecutionWorkflowService.SCENARIO_AD_HOC_AGENT_RUN),
                eq(7L),
                eq("[]")
        )).thenReturn(workflowPlan);
        when(executionWorkflowService.buildStepInput(any(), any(), any(), any(), any()))
                .thenReturn("请异步执行一次兼容单次运行");
        when(agentExecutionService.supportsAsyncExecution(cliAgent, ExecutionWorkflowService.STEP_AD_HOC_RUN))
                .thenReturn(true);
        when(executionAsyncSessionService.submitTimeoutSeconds()).thenReturn(15);
        when(executionAsyncSessionService.maxRuntimeSeconds(
                ExecutionWorkflowService.STEP_AD_HOC_RUN,
                executionTask.getInputPayload()
        )).thenReturn(600);
        when(agentExecutionService.startAsyncExecution(
                eq(cliAgent),
                any(),
                any(),
                eq(15),
                eq(600)
        )).thenReturn(new AgentExecutionService.AsyncExecutionStartResult(
                "ad-hoc-session-1",
                true,
                "CLI",
                "C:/workspace",
                "2026-04-19T10:00:00Z"
        ));
        when(executionAsyncSessionService.awaitTerminalStep(anyLong(), eq(600))).thenAnswer(invocation -> {
            ExecutionStepEntity terminalStep = new ExecutionStepEntity();
            terminalStep.setId(invocation.getArgument(0));
            terminalStep.setStatus("SUCCESS");
            terminalStep.setOutputSnapshot("""
                    ## 执行结果

                    已通过异步 CLI runtime 完成兼容单次运行
                    """);
            return terminalStep;
        });

        ExecutionRunEntity result = executionDispatchService.dispatchTaskNow(99L);

        assertThat(result.getStatus()).isEqualTo("SUCCESS");
        assertThat(result.getOutputSummary()).contains("异步 CLI runtime");
        verify(agentExecutionService).startAsyncExecution(eq(cliAgent), eq("请异步执行一次兼容单次运行"), any(), eq(15), eq(600));
        verify(executionAsyncSessionService).bindRunnerSession(
                eq(executionTask),
                any(),
                any(),
                eq("ad-hoc-session-1"),
                eq("CLI"),
                eq("C:/workspace")
        );
        verify(executionAsyncSessionService).awaitTerminalStep(anyLong(), eq(600));
        verify(agentExecutionService, never()).runAgent(eq(22L), any(), any());
    }

    /**
     * 取消态同样会生成 run 级摘要，若不发事件，前端只能等下次刷新才看得到取消产物。
     */
    @Test
    void shouldEmitArtifactReadyForRunLevelSummaryArtifactOnCancel() {
        ExecutionTaskEntity executionTask = buildExecutionTask();
        ExecutionRunEntity executionRun = new ExecutionRunEntity();
        executionRun.setId(302L);
        executionRun.setExecutionTask(executionTask);

        when(executionRunRepository.save(any(ExecutionRunEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(executionTaskRepository.save(any(ExecutionTaskEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(executionArtifactRepository.save(any(ExecutionArtifactEntity.class))).thenAnswer(invocation -> {
            ExecutionArtifactEntity artifact = invocation.getArgument(0);
            artifact.setId(902L);
            return artifact;
        });

        executionDispatchService.finishCanceled(executionTask, executionRun, new java.util.ArrayList<>());

        verify(executionEventService).recordArtifactReady(executionTask, executionRun, null, 902L, "取消摘要");
    }

    /**
     * 自动化测试失败后也要发送站内通知，帮助测试同学直接从消息中心回到失败执行单。
     */
    @Test
    void shouldNotifyRequesterWhenTestAutomationFails() {
        ExecutionTaskEntity executionTask = buildExecutionTask();
        executionTask.setScenarioCode(ExecutionWorkflowService.SCENARIO_TEST_AUTOMATION);
        executionTask.setTitle("自动化回归任务");
        executionTask.setCreatedByUser(buildUser(79L, "测试同学"));
        ExecutionRunEntity executionRun = new ExecutionRunEntity();
        executionRun.setId(305L);
        executionRun.setExecutionTask(executionTask);
        executionRun.setOutputSummary("共 6 条自动化用例，失败 2 条。");

        ExecutionStepEntity failedStep = new ExecutionStepEntity();
        failedStep.setId(602L);
        failedStep.setRun(executionRun);
        failedStep.setStepName("执行自动化");

        when(executionRunRepository.save(any(ExecutionRunEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(executionStepRepository.save(any(ExecutionStepEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(executionTaskRepository.save(any(ExecutionTaskEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(executionArtifactRepository.save(any(ExecutionArtifactEntity.class))).thenAnswer(invocation -> {
            ExecutionArtifactEntity artifact = invocation.getArgument(0);
            artifact.setId(905L);
            return artifact;
        });

        executionDispatchService.finishFailed(
                executionTask,
                executionRun,
                failedStep,
                new IllegalStateException("自动化执行失败，2 条用例未通过"),
                new java.util.ArrayList<>()
        );

        verify(notificationService).sendToUser(
                eq(79L),
                eq(NotificationService.TYPE_TASK),
                eq(NotificationService.LEVEL_ERROR),
                eq("自动化测试失败：自动化回归任务"),
                org.mockito.ArgumentMatchers.contains("自动化执行失败，2 条用例未通过"),
                eq("/tasks/99"),
                eq("TEST_AUTOMATION_FAILED"),
                eq(99L)
        );
    }

    /**
     * 仓库扫描被取消后仍应给发起人发送提醒，避免用户误以为任务仍在运行。
     */
    @Test
    void shouldNotifyRequesterWhenRepositoryScanCanceled() {
        ExecutionTaskEntity executionTask = buildExecutionTask();
        executionTask.setScenarioCode(ExecutionWorkflowService.SCENARIO_CODEBASE_COMPLIANCE_SCAN);
        executionTask.setTitle("仓库扫描任务");
        executionTask.setCreatedByUser(buildUser(80L, "扫描发起人"));
        ExecutionRunEntity executionRun = new ExecutionRunEntity();
        executionRun.setId(306L);
        executionRun.setExecutionTask(executionTask);
        executionRun.setOutputSummary("仓库扫描已取消，基础报告已保留。");

        when(executionRunRepository.save(any(ExecutionRunEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(executionTaskRepository.save(any(ExecutionTaskEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(executionArtifactRepository.save(any(ExecutionArtifactEntity.class))).thenAnswer(invocation -> {
            ExecutionArtifactEntity artifact = invocation.getArgument(0);
            artifact.setId(906L);
            return artifact;
        });

        executionDispatchService.finishCanceled(executionTask, executionRun, new java.util.ArrayList<>());

        verify(notificationService).sendToUser(
                eq(80L),
                eq(NotificationService.TYPE_TASK),
                eq(NotificationService.LEVEL_WARNING),
                eq("仓库规范扫描已取消：仓库扫描任务"),
                org.mockito.ArgumentMatchers.contains("仓库扫描已取消"),
                eq("/tasks/99"),
                eq("CODEBASE_SCAN_CANCELED"),
                eq(99L)
        );
    }

    /**
     * 兼容单次执行等非专用场景也要走统一站内通知兜底，避免新增场景后再次漏通知。
     */
    @Test
    void shouldNotifyRequesterWhenGenericExecutionSucceeds() {
        ExecutionTaskEntity executionTask = buildExecutionTask();
        executionTask.setScenarioCode(ExecutionWorkflowService.SCENARIO_AD_HOC_AGENT_RUN);
        executionTask.setTitle("兼容单次运行任务");
        executionTask.setCreatedByUser(buildUser(81L, "兼容执行人"));
        ExecutionRunEntity executionRun = new ExecutionRunEntity();
        executionRun.setId(307L);
        executionRun.setExecutionTask(executionTask);
        executionRun.setOutputSummary("兼容单次运行已完成，产物已生成。");

        when(executionRunRepository.save(any(ExecutionRunEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(executionTaskRepository.save(any(ExecutionTaskEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(executionArtifactRepository.save(any(ExecutionArtifactEntity.class))).thenAnswer(invocation -> {
            ExecutionArtifactEntity artifact = invocation.getArgument(0);
            artifact.setId(907L);
            return artifact;
        });

        executionDispatchService.finishSuccess(executionTask, executionRun, new java.util.ArrayList<>());

        verify(notificationService).sendToUser(
                eq(81L),
                eq(NotificationService.TYPE_TASK),
                eq(NotificationService.LEVEL_SUCCESS),
                eq("兼容单次执行已完成：兼容单次运行任务"),
                org.mockito.ArgumentMatchers.contains("兼容单次运行已完成"),
                eq("/tasks/99"),
                eq("EXECUTION_COMPLETED"),
                eq(99L)
        );
    }

    private ExecutionTaskEntity buildExecutionTask() {
        ProjectEntity project = new ProjectEntity("执行中心项目", "张三", "进行中", "用于调度测试");
        project.setId(7L);
        TaskEntity workItem = new TaskEntity();
        workItem.setId(6L);
        workItem.setName("修复执行中心懒加载");
        workItem.setWorkItemCode("TASK-006");
        workItem.setWorkItemType("任务");

        ExecutionTaskEntity executionTask = new ExecutionTaskEntity();
        executionTask.setId(99L);
        executionTask.setTitle("开发执行任务");
        executionTask.setScenarioCode(ExecutionWorkflowService.SCENARIO_DEVELOPMENT_IMPLEMENTATION);
        executionTask.setProject(project);
        executionTask.setWorkItem(workItem);
        executionTask.setStatus("PENDING");
        executionTask.setAgentBindingPayload("[]");
        executionTask.setInputPayload("{\"repositories\":[]}");
        executionTask.setLatestSummary("等待调度");
        return executionTask;
    }

    private AgentEntity buildAgent(Long id) {
        AgentEntity agent = new AgentEntity();
        agent.setId(id);
        agent.setName("步骤智能体-" + id);
        agent.setType("执行");
        agent.setStatus("在线");
        agent.setEnabled(true);
        agent.setAccessType(AgentExecutionService.ACCESS_HTTP_API);
        return agent;
    }

    private AgentEntity buildCliRuntimeAgent(Long id, String runtimeType) {
        AgentEntity agent = buildAgent(id);
        agent.setAccessType(AgentExecutionService.ACCESS_AGENT_RUNTIME);
        agent.setRuntimeType(runtimeType);
        agent.setEndpointUrl("http://127.0.0.1:8090");
        return agent;
    }

    private com.aiclub.platform.domain.model.UserEntity buildUser(Long id, String nickname) {
        com.aiclub.platform.domain.model.UserEntity user = new com.aiclub.platform.domain.model.UserEntity();
        user.setId(id);
        user.setUsername("execution-user-" + id);
        user.setNickname(nickname);
        user.setEnabled(true);
        return user;
    }
}
