package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.AgentEntity;
import com.aiclub.platform.domain.model.ExecutionArtifactEntity;
import com.aiclub.platform.domain.model.ExecutionRunEntity;
import com.aiclub.platform.domain.model.ExecutionStepEntity;
import com.aiclub.platform.domain.model.ExecutionTaskEntity;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.ProjectGitlabBindingEntity;
import com.aiclub.platform.domain.model.TaskEntity;
import com.aiclub.platform.repository.ExecutionArtifactRepository;
import com.aiclub.platform.repository.ExecutionRunRepository;
import com.aiclub.platform.repository.ExecutionStepRepository;
import com.aiclub.platform.repository.ExecutionTaskRepository;
import com.aiclub.platform.repository.ProjectGitlabBindingRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.when;

/**
 * 验证技术设计专用编排器的顺序执行、前序上下文传递和语义产物落库。
 */
@ExtendWith(MockitoExtension.class)
class TechnicalDesignExecutionServiceTests {

    @Mock private ProjectGitlabBindingRepository projectGitlabBindingRepository;
    @Mock private ExecutionStepRepository executionStepRepository;
    @Mock private ExecutionRunRepository executionRunRepository;
    @Mock private ExecutionArtifactRepository executionArtifactRepository;
    @Mock private ExecutionTaskRepository executionTaskRepository;
    @Mock private AgentExecutionService agentExecutionService;
    @Mock private ExecutionEventService executionEventService;
    @Mock private ExecutionAsyncSessionService executionAsyncSessionService;
    @Mock private TokenCipherService tokenCipherService;

    private TechnicalDesignExecutionService service;

    @BeforeEach
    void setUp() {
        service = new TechnicalDesignExecutionService(
                projectGitlabBindingRepository,
                executionStepRepository,
                executionRunRepository,
                executionArtifactRepository,
                executionTaskRepository,
                agentExecutionService,
                executionEventService,
                executionAsyncSessionService,
                tokenCipherService,
                new ObjectMapper()
        );
    }

    @Test
    void shouldExecuteThreeStepsAndPersistSemanticMarkdownArtifacts() {
        ProjectEntity project = new ProjectEntity("演示项目", "owner", "进行中", "");
        project.setId(11L);
        TaskEntity workItem = new TaskEntity();
        workItem.setId(77L);
        workItem.setName("设计双端运行时");
        workItem.setWorkItemCode("TASK-77");
        workItem.setWorkItemType("任务");
        workItem.setTaskType("技术设计");
        workItem.setDescription("需要结合真实仓库输出设计");
        workItem.setProject(project);

        ExecutionTaskEntity executionTask = new ExecutionTaskEntity();
        executionTask.setId(100L);
        executionTask.setTitle("设计双端运行时 - 技术设计生成");
        executionTask.setScenarioCode(ExecutionWorkflowService.SCENARIO_TECHNICAL_DESIGN_AUTHORING);
        executionTask.setProject(project);
        executionTask.setWorkItem(workItem);
        executionTask.setInputPayload("""
                {"inputText":"保持接口兼容","preferGitNexus":true,"repositories":[{"bindingId":1,"targetBranch":"main"}]}
                """);

        ExecutionRunEntity run = new ExecutionRunEntity();
        run.setId(200L);
        run.setRunNo(1);
        run.setExecutionTask(executionTask);

        ProjectGitlabBindingEntity binding = new ProjectGitlabBindingEntity();
        binding.setId(1L);
        binding.setProject(project);
        binding.setEnabled(true);
        binding.setGitlabProjectPath("group/backend");
        binding.setGitlabProjectRef("group/backend");
        binding.setGitlabHttpCloneUrl("https://gitlab.example/group/backend.git");
        binding.setApiBaseUrl("https://gitlab.example");
        binding.setTokenCiphertext("cipher");
        when(projectGitlabBindingRepository.findById(1L)).thenReturn(Optional.of(binding));
        when(tokenCipherService.decrypt("cipher")).thenReturn("token");

        AtomicLong stepId = new AtomicLong(300L);
        when(executionStepRepository.save(any(ExecutionStepEntity.class))).thenAnswer(invocation -> {
            ExecutionStepEntity step = invocation.getArgument(0);
            if (step.getId() == null) step.setId(stepId.getAndIncrement());
            return step;
        });
        AtomicLong artifactId = new AtomicLong(400L);
        when(executionArtifactRepository.save(any(ExecutionArtifactEntity.class))).thenAnswer(invocation -> {
            ExecutionArtifactEntity artifact = invocation.getArgument(0);
            artifact.setId(artifactId.getAndIncrement());
            return artifact;
        });
        when(executionRunRepository.save(any(ExecutionRunEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(executionTaskRepository.save(any(ExecutionTaskEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(agentExecutionService.supportsAsyncExecution(any(AgentEntity.class), anyString())).thenReturn(false);
        when(agentExecutionService.runAgent(any(), anyString(), anyMap()))
                .thenReturn("# 代码理解\n\n## GitNexus 使用情况\n已使用")
                .thenReturn("# 技术设计\n\n## 方案概览\n采用专用编排")
                .thenReturn("# 设计自检\n\n结论：可进入开发");

        AgentEntity codex = new AgentEntity();
        codex.setId(9L);
        codex.setAccessType(AgentExecutionService.ACCESS_AGENT_RUNTIME);
        codex.setRuntimeType(AgentExecutionService.RUNTIME_CODEX_CLI);
        ExecutionWorkflowService.WorkflowPlan plan = new ExecutionWorkflowService.WorkflowPlan(
                ExecutionWorkflowService.SCENARIO_TECHNICAL_DESIGN_AUTHORING,
                "技术设计生成",
                List.of(
                        new ExecutionWorkflowService.ExecutionStepPlan(1, ExecutionWorkflowService.STEP_CODE_CONTEXT, "代码理解", codex, null, null, null),
                        new ExecutionWorkflowService.ExecutionStepPlan(2, ExecutionWorkflowService.STEP_DESIGN_DRAFT, "方案生成", codex, null, null, null),
                        new ExecutionWorkflowService.ExecutionStepPlan(3, ExecutionWorkflowService.STEP_DESIGN_REVIEW, "设计自检", codex, null, null, null)
                )
        );

        TechnicalDesignExecutionService.TechnicalDesignExecutionResult result = service.executeTechnicalDesignTask(executionTask, run, plan);

        assertThat(result.canceled()).isFalse();
        assertThat(result.artifacts())
                .extracting(ExecutionArtifactEntity::getArtifactType)
                .containsExactly("CODE_CONTEXT_MARKDOWN", "TECHNICAL_DESIGN_MARKDOWN", "DESIGN_REVIEW_MARKDOWN");
        assertThat(run.getOutputSummary()).contains("设计自检");
    }

    @Test
    void shouldReturnCanceledWhenAsyncRuntimeIsCanceledInsideStep() {
        ProjectEntity project = new ProjectEntity("演示项目", "owner", "进行中", "");
        project.setId(11L);
        TaskEntity workItem = new TaskEntity();
        workItem.setId(77L);
        workItem.setName("设计双端运行时");
        workItem.setWorkItemType("任务");
        workItem.setTaskType("技术设计");
        workItem.setProject(project);

        ExecutionTaskEntity executionTask = new ExecutionTaskEntity();
        executionTask.setId(100L);
        executionTask.setTitle("设计双端运行时 - 技术设计生成");
        executionTask.setScenarioCode(ExecutionWorkflowService.SCENARIO_TECHNICAL_DESIGN_AUTHORING);
        executionTask.setProject(project);
        executionTask.setWorkItem(workItem);
        executionTask.setInputPayload("""
                {"preferGitNexus":true,"repositories":[{"bindingId":1,"targetBranch":"main"}]}
                """);

        ExecutionRunEntity run = new ExecutionRunEntity();
        run.setId(200L);
        run.setRunNo(1);
        run.setExecutionTask(executionTask);

        ProjectGitlabBindingEntity binding = new ProjectGitlabBindingEntity();
        binding.setId(1L);
        binding.setProject(project);
        binding.setEnabled(true);
        binding.setGitlabProjectPath("group/backend");
        binding.setGitlabProjectRef("group/backend");
        binding.setGitlabHttpCloneUrl("https://gitlab.example/group/backend.git");
        binding.setTokenCiphertext("cipher");
        when(projectGitlabBindingRepository.findById(1L)).thenReturn(Optional.of(binding));
        when(tokenCipherService.decrypt("cipher")).thenReturn("token");
        when(executionStepRepository.save(any(ExecutionStepEntity.class))).thenAnswer(invocation -> {
            ExecutionStepEntity step = invocation.getArgument(0);
            if (step.getId() == null) step.setId(300L);
            return step;
        });
        when(executionRunRepository.save(any(ExecutionRunEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(executionTaskRepository.save(any(ExecutionTaskEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(agentExecutionService.supportsAsyncExecution(any(AgentEntity.class), anyString())).thenReturn(true);
        when(executionAsyncSessionService.maxRuntimeSeconds(anyString(), anyString())).thenReturn(600);
        when(executionAsyncSessionService.submitTimeoutSeconds()).thenReturn(30);
        when(agentExecutionService.startAsyncExecution(any(), anyString(), anyMap(), anyInt(), anyInt()))
                .thenReturn(new AgentExecutionService.AsyncExecutionStartResult(
                        "session-canceled", true, "CLI", "C:/workspace", "2026-07-11T12:00:00Z"
                ));
        ExecutionStepEntity canceledStep = new ExecutionStepEntity();
        canceledStep.setStatus("CANCELED");
        canceledStep.setLatestMessage("用户已取消技术设计");
        when(executionAsyncSessionService.awaitTerminalStep(300L, 600)).thenReturn(canceledStep);

        AgentEntity codex = new AgentEntity();
        codex.setId(9L);
        codex.setAccessType(AgentExecutionService.ACCESS_AGENT_RUNTIME);
        codex.setRuntimeType(AgentExecutionService.RUNTIME_CODEX_CLI);
        ExecutionWorkflowService.WorkflowPlan plan = new ExecutionWorkflowService.WorkflowPlan(
                ExecutionWorkflowService.SCENARIO_TECHNICAL_DESIGN_AUTHORING,
                "技术设计生成",
                List.of(
                        new ExecutionWorkflowService.ExecutionStepPlan(1, ExecutionWorkflowService.STEP_CODE_CONTEXT, "代码理解", codex, null, null, null),
                        new ExecutionWorkflowService.ExecutionStepPlan(2, ExecutionWorkflowService.STEP_DESIGN_DRAFT, "方案生成", codex, null, null, null),
                        new ExecutionWorkflowService.ExecutionStepPlan(3, ExecutionWorkflowService.STEP_DESIGN_REVIEW, "设计自检", codex, null, null, null)
                )
        );

        TechnicalDesignExecutionService.TechnicalDesignExecutionResult result =
                service.executeTechnicalDesignTask(executionTask, run, plan);

        assertThat(result.canceled()).isTrue();
        assertThat(result.summary()).contains("用户已取消");
        assertThat(result.artifacts()).isEmpty();
    }
}
