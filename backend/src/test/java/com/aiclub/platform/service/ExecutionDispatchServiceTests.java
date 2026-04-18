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
    private ExecutionEventService executionEventService;

    @Mock
    private ExecutionAsyncSessionService executionAsyncSessionService;

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
                executionEventService,
                executionAsyncSessionService,
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
                    return new DevelopmentExecutionService.DevelopmentExecutionResult("开发执行已完成", List.of(), false);
                });
        when(executionArtifactRepository.save(any(ExecutionArtifactEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        ExecutionRunEntity result = executionDispatchService.dispatchTaskNow(99L);

        assertThat(result.getStatus()).isEqualTo("SUCCESS");
        verify(executionTaskRepository, never()).findById(99L);
        verify(executionTaskRepository, atLeastOnce()).findWithExecutionContextById(99L);
        verify(developmentExecutionService).executeDevelopmentTask(eq(executionTask), any(ExecutionRunEntity.class), eq(workflowPlan));
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
        agent.setCategory("执行");
        agent.setStatus("在线");
        agent.setEnabled(true);
        agent.setAccessType(AgentExecutionService.ACCESS_HTTP_API);
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
