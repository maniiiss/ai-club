package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.AgentEntity;
import com.aiclub.platform.domain.model.ExecutionArtifactEntity;
import com.aiclub.platform.domain.model.ExecutionRunEntity;
import com.aiclub.platform.domain.model.ExecutionStepEntity;
import com.aiclub.platform.domain.model.ExecutionTaskEntity;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.ProjectGitlabBindingEntity;
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

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 覆盖多仓开发执行在失败场景下的停止策略、报告补偿和 harness 命令选择。
 */
@ExtendWith(MockitoExtension.class)
class DevelopmentExecutionServiceTests {

    @Mock
    private ProjectGitlabBindingRepository projectGitlabBindingRepository;

    @Mock
    private ExecutionStepRepository executionStepRepository;

    @Mock
    private ExecutionRunRepository executionRunRepository;

    @Mock
    private ExecutionArtifactRepository executionArtifactRepository;

    @Mock
    private ExecutionTaskRepository executionTaskRepository;

    @Mock
    private AgentExecutionService agentExecutionService;

    @Mock
    private ExecutionEventService executionEventService;

    @Mock
    private ExecutionAsyncSessionService executionAsyncSessionService;

    @Mock
    private TokenCipherService tokenCipherService;

    @Mock
    private GitlabApiService gitlabApiService;

    private DevelopmentExecutionService developmentExecutionService;

    private final List<ExecutionStepEntity> savedSteps = new ArrayList<>();
    private final List<ExecutionArtifactEntity> savedArtifacts = new ArrayList<>();

    @BeforeEach
    void setUp() {
        developmentExecutionService = new DevelopmentExecutionService(
                projectGitlabBindingRepository,
                executionStepRepository,
                executionRunRepository,
                executionArtifactRepository,
                executionTaskRepository,
                agentExecutionService,
                executionEventService,
                executionAsyncSessionService,
                tokenCipherService,
                gitlabApiService,
                new ObjectMapper()
        );
        savedSteps.clear();
        savedArtifacts.clear();

        lenient().when(executionStepRepository.findAllByRun_IdOrderByStepNoAscIdAsc(1001L)).thenAnswer(invocation -> new ArrayList<>(savedSteps));
        when(executionStepRepository.findByRun_IdAndStepNo(eq(1001L), any(Integer.class))).thenAnswer(invocation ->
                savedSteps.stream()
                        .filter(step -> Objects.equals(step.getStepNo(), invocation.getArgument(1, Integer.class)))
                        .findFirst()
        );
        when(executionStepRepository.save(any(ExecutionStepEntity.class))).thenAnswer(invocation -> {
            ExecutionStepEntity step = invocation.getArgument(0);
            if (step.getId() == null) {
                step.setId(8000L + savedSteps.size() + 1);
                savedSteps.add(step);
            } else if (savedSteps.stream().noneMatch(item -> Objects.equals(item.getId(), step.getId()))) {
                savedSteps.add(step);
            }
            return step;
        });
        when(executionArtifactRepository.save(any(ExecutionArtifactEntity.class))).thenAnswer(invocation -> {
            ExecutionArtifactEntity artifact = invocation.getArgument(0);
            if (artifact.getId() == null) {
                artifact.setId(9000L + savedArtifacts.size() + 1);
            }
            savedArtifacts.add(artifact);
            return artifact;
        });
        when(executionRunRepository.save(any(ExecutionRunEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(executionTaskRepository.save(any(ExecutionTaskEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        lenient().when(executionTaskRepository.findCancelRequestedFlagById(99L)).thenReturn(false);
        lenient().when(executionAsyncSessionService.submitTimeoutSeconds()).thenReturn(15);
        lenient().when(executionAsyncSessionService.maxRuntimeSeconds(any(String.class))).thenAnswer(invocation -> {
            String stepCode = invocation.getArgument(0, String.class);
            if ("IMPLEMENT".equalsIgnoreCase(stepCode)) {
                return 3600;
            }
            if ("TEST".equalsIgnoreCase(stepCode)) {
                return 2400;
            }
            return 600;
        });
        lenient().when(tokenCipherService.decrypt("cipher-1")).thenReturn("token-1");
        lenient().when(tokenCipherService.decrypt("cipher-2")).thenReturn("token-2");
        when(projectGitlabBindingRepository.findById(1L)).thenReturn(Optional.of(buildBinding(1L, "group/frontend", "cipher-1")));
        when(projectGitlabBindingRepository.findById(2L)).thenReturn(Optional.of(buildBinding(2L, "group/backend", "cipher-2")));
    }

    /**
     * 规划步骤应向 Claude Code 透传完整多仓 JSON 上下文，并在输入中明确要求输出候选改动位置。
     */
    @Test
    void shouldProvideStructuredRepositoryVariablesAndPlanRequirementsToPlanStep() {
        ExecutionTaskEntity executionTask = buildExecutionTask();
        ExecutionRunEntity executionRun = buildExecutionRun(executionTask);
        ExecutionWorkflowService.WorkflowPlan workflowPlan = buildWorkflowPlan();

        when(agentExecutionService.runAgent(eq(11L), any(String.class), any(Map.class)))
                .thenReturn("# 总体结论\n先做 frontend，再做 backend。");
        when(agentExecutionService.runAgent(eq(12L), any(String.class), any(Map.class)))
                .thenReturn("""
                        {
                          "status": "FAILED",
                          "summary": "frontend 仓库开发失败",
                          "changedFiles": [],
                          "commandsExecuted": [],
                          "log": "编译未通过"
                        }
                        """);
        when(agentExecutionService.runAgent(eq(14L), any(String.class), any(Map.class)))
                .thenReturn("""
                        # 交付报告

                        frontend 仓库在开发实现阶段失败，backend 仓库未执行。
                        """);

        assertThatThrownBy(() -> developmentExecutionService.executeDevelopmentTask(executionTask, executionRun, workflowPlan))
                .isInstanceOf(DevelopmentExecutionService.DevelopmentExecutionStepException.class);

        verify(agentExecutionService).runAgent(
                eq(11L),
                argThat(input -> input.contains("候选改动目录、文件或模块")
                        && input.contains("跨仓依赖")
                        && input.contains("IMPLEMENT / TEST")),
                argThat(variables -> "2".equals(String.valueOf(variables.get("development_repository_count")))
                        && "".equals(String.valueOf(variables.get("user_id")))
                        && "".equals(String.valueOf(variables.get("user_name")))
                        && String.valueOf(variables.get("development_repositories_json")).contains("\"displayName\":\"group/frontend\"")
                        && String.valueOf(variables.get("development_repositories_json")).contains("\"projectPath\":\"group/backend\"")
                        && String.valueOf(variables.get("development_repositories_json")).contains("\"targetBranch\":\"release/1.0\""))
        );
    }

    /**
     * 规划确认模式只会自动执行 PLAN；规划产出后任务应停在待确认态，等待发起人进入详情页确认继续。
     */
    @Test
    void shouldPauseAfterPlanWhenPlanConfirmationIsRequired() {
        ExecutionTaskEntity executionTask = buildExecutionTask(true);
        ExecutionRunEntity executionRun = buildExecutionRun(executionTask);
        ExecutionWorkflowService.WorkflowPlan workflowPlan = buildWorkflowPlan();

        when(agentExecutionService.runAgent(eq(11L), any(String.class), any(Map.class)))
                .thenReturn("# 执行规划\n\n- 先改 frontend\n- 再改 backend");

        DevelopmentExecutionService.DevelopmentExecutionResult result =
                developmentExecutionService.executeDevelopmentTask(executionTask, executionRun, workflowPlan);

        assertThat(result.awaitingConfirmation()).isTrue();
        assertThat(result.canceled()).isFalse();
        assertThat(executionTask.getStatus()).isEqualTo("WAITING_CONFIRMATION");
        assertThat(executionRun.getStatus()).isEqualTo("WAITING_CONFIRMATION");
        assertThat(savedSteps)
                .extracting(ExecutionStepEntity::getStepName, ExecutionStepEntity::getStatus)
                .containsExactly(org.assertj.core.groups.Tuple.tuple("执行规划", "SUCCESS"));
        assertThat(savedArtifacts)
                .extracting(ExecutionArtifactEntity::getArtifactType)
                .containsExactly("PLAN_MARKDOWN");
        verify(agentExecutionService, org.mockito.Mockito.never()).runAgent(eq(12L), any(String.class), any(Map.class));
        verify(agentExecutionService, org.mockito.Mockito.never()).runAgent(eq(13L), any(String.class), any(Map.class));
    }

    /**
     * 任一仓库开发失败后应停止后续仓库，但仍然生成统一报告沉淀失败位置和未执行仓库。
     */
    @Test
    void shouldStopLaterRepositoriesWhenImplementationFailsButStillGenerateReport() {
        ExecutionTaskEntity executionTask = buildExecutionTask();
        ExecutionRunEntity executionRun = buildExecutionRun(executionTask);
        ExecutionWorkflowService.WorkflowPlan workflowPlan = buildWorkflowPlan();

        when(agentExecutionService.runAgent(eq(11L), any(String.class), any(Map.class)))
                .thenReturn("# 执行规划\n先做 frontend，再做 backend。");
        when(agentExecutionService.runAgent(eq(12L), any(String.class), any(Map.class)))
                .thenReturn("""
                        {
                          "status": "FAILED",
                          "summary": "frontend 仓库开发失败",
                          "changedFiles": [],
                          "commandsExecuted": [],
                          "log": "编译未通过"
                        }
                        """);
        when(agentExecutionService.runAgent(eq(14L), any(String.class), any(Map.class)))
                .thenReturn("""
                        # 交付报告

                        frontend 仓库在开发实现阶段失败，backend 仓库未执行。
                        """);

        assertThatThrownBy(() -> developmentExecutionService.executeDevelopmentTask(executionTask, executionRun, workflowPlan))
                .isInstanceOf(DevelopmentExecutionService.DevelopmentExecutionStepException.class)
                .hasMessageContaining("frontend 仓库开发失败");

        assertThat(savedSteps)
                .extracting(ExecutionStepEntity::getStepName, ExecutionStepEntity::getStatus)
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple("执行规划", "SUCCESS"),
                        org.assertj.core.groups.Tuple.tuple("开发实现 · group/frontend", "FAILED"),
                        org.assertj.core.groups.Tuple.tuple("交付报告", "SUCCESS")
                );
        assertThat(savedArtifacts)
                .extracting(ExecutionArtifactEntity::getArtifactType)
                .containsExactly("PLAN_MARKDOWN", "REPORT_MARKDOWN");
        verify(agentExecutionService, org.mockito.Mockito.never())
                .runAgent(eq(13L), any(String.class), any(Map.class));
    }

    /**
     * IMPLEMENT 输入只应携带与当前仓库相关的规划摘要，避免整份长规划把执行上下文撑爆。
     */
    @Test
    void shouldCompactPlanMarkdownBeforePassingToImplementationAgent() {
        ExecutionTaskEntity executionTask = buildExecutionTask();
        ExecutionRunEntity executionRun = buildExecutionRun(executionTask);
        ExecutionWorkflowService.WorkflowPlan workflowPlan = buildWorkflowPlan();
        String longPlanMarkdown = """
                # 总体结论
                先处理 frontend 仓库，再处理 backend 仓库。

                # 仓库执行顺序
                1. group/frontend
                2. group/backend

                # 仓库规划
                ## 仓库 1：group/frontend
                - 候选文件：src/views/demo/App.vue
                - 预期改动：调整前端展示逻辑

                ## 仓库 2：group/backend
                - 候选文件：backend/src/main/App.java
                - 预期改动：调整后端接口

                # 跨仓依赖与风险
                超长尾部噪音超长尾部噪音超长尾部噪音超长尾部噪音超长尾部噪音超长尾部噪音超长尾部噪音超长尾部噪音
                超长尾部噪音超长尾部噪音超长尾部噪音超长尾部噪音超长尾部噪音超长尾部噪音超长尾部噪音超长尾部噪音
                超长尾部噪音超长尾部噪音超长尾部噪音超长尾部噪音超长尾部噪音超长尾部噪音超长尾部噪音超长尾部噪音
                超长尾部噪音超长尾部噪音超长尾部噪音超长尾部噪音超长尾部噪音超长尾部噪音超长尾部噪音超长尾部噪音
                # 建议验证范围
                - 执行前端构建
                """.repeat(10);

        when(agentExecutionService.runAgent(eq(11L), any(String.class), any(Map.class)))
                .thenReturn(longPlanMarkdown);
        when(agentExecutionService.runAgent(
                eq(12L),
                argThat(input -> input.contains("## 执行规划摘要")
                        && input.contains("## 仓库 1：group/frontend")
                        && !input.contains("超长尾部噪音超长尾部噪音超长尾部噪音超长尾部噪音超长尾部噪音超长尾部噪音超长尾部噪音超长尾部噪音超长尾部噪音超长尾部噪音")
                        && input.length() < 5000),
                any(Map.class)))
                .thenReturn("""
                        {
                          "status": "FAILED",
                          "summary": "frontend 仓库开发失败",
                          "changedFiles": [],
                          "commandsExecuted": [],
                          "log": "编译未通过",
                          "workBranch": null,
                          "commitSha": null,
                          "mergeRequestUrl": null
                        }
                        """);
        when(agentExecutionService.runAgent(eq(14L), any(String.class), any(Map.class)))
                .thenReturn("""
                        # 交付报告

                        frontend 仓库在开发实现阶段失败，backend 仓库未执行。
                        """);

        assertThatThrownBy(() -> developmentExecutionService.executeDevelopmentTask(executionTask, executionRun, workflowPlan))
                .isInstanceOf(DevelopmentExecutionService.DevelopmentExecutionStepException.class);
    }

    /**
     * 发起人确认后恢复执行时，IMPLEMENT 读取的应是用户最后保存的规划正文，
     * 而不是重新再跑一次 PLAN 或继续使用确认前的旧版本。
     */
    @Test
    void shouldReuseSavedPlanMarkdownWhenResumingAfterConfirmation() {
        ExecutionTaskEntity executionTask = buildExecutionTask(true);
        executionTask.setStatus("RUNNING");
        ExecutionRunEntity executionRun = buildExecutionRun(executionTask);
        executionRun.setStatus("RUNNING");
        executionRun.setCurrentStepNo(1);

        ExecutionStepEntity savedPlanStep = new ExecutionStepEntity();
        savedPlanStep.setId(8100L);
        savedPlanStep.setRun(executionRun);
        savedPlanStep.setStepNo(1);
        savedPlanStep.setStepCode("PLAN");
        savedPlanStep.setStepName("执行规划");
        savedPlanStep.setStatus("SUCCESS");
        savedPlanStep.setOutputSnapshot("""
                # 人工修改后的规划

                - frontend 先加确认开关
                - backend 再补待确认状态
                """);
        savedSteps.add(savedPlanStep);

        ExecutionWorkflowService.WorkflowPlan workflowPlan = buildWorkflowPlan();
        when(agentExecutionService.runAgent(
                eq(12L),
                argThat(input -> input.contains("人工修改后的规划") && !input.contains("## 输出要求\n- 使用 Markdown")),
                any(Map.class)))
                .thenReturn("""
                        {
                          "status": "FAILED",
                          "summary": "frontend 仓库开发失败",
                          "changedFiles": [],
                          "commandsExecuted": [],
                          "log": "实现阶段主动中止"
                        }
                        """);
        when(agentExecutionService.runAgent(eq(14L), any(String.class), any(Map.class)))
                .thenReturn("""
                        # 交付报告

                        frontend 仓库在开发实现阶段失败，backend 仓库未执行。
                        """);

        assertThatThrownBy(() -> developmentExecutionService.executeDevelopmentTask(executionTask, executionRun, workflowPlan))
                .isInstanceOf(DevelopmentExecutionService.DevelopmentExecutionStepException.class)
                .hasMessageContaining("frontend 仓库开发失败");

        verify(agentExecutionService, org.mockito.Mockito.never()).runAgent(eq(11L), any(String.class), any(Map.class));
    }

    /**
     * 任一仓库测试失败后也要停止后续仓库，并把平台选出的 harness 命令透传给测试执行器。
     */
    @Test
    void shouldStopLaterRepositoriesWhenTestFailsAndProvideHarnessCommands() {
        ExecutionTaskEntity executionTask = buildExecutionTask();
        ExecutionRunEntity executionRun = buildExecutionRun(executionTask);
        ExecutionWorkflowService.WorkflowPlan workflowPlan = buildWorkflowPlan();

        when(agentExecutionService.runAgent(eq(11L), any(String.class), any(Map.class)))
                .thenReturn("# 执行规划\n先做 frontend，再做 backend。");
        when(agentExecutionService.runAgent(eq(12L), any(String.class), any(Map.class)))
                .thenReturn("""
                        {
                          "status": "SUCCESS",
                          "summary": "frontend 仓库已完成开发",
                          "changedFiles": ["backend/src/main/App.java", "frontend/src/App.vue"],
                          "commandsExecuted": ["git status"],
                          "log": "实现完成",
                          "workBranch": "feature/multi-repo"
                        }
                        """);
        when(agentExecutionService.runAgent(
                eq(13L),
                any(String.class),
                argThat(variables ->
                        String.valueOf(variables.get("test_commands_json")).contains("python scripts/check_encoding.py")
                                && String.valueOf(variables.get("test_commands_json")).contains("cd backend && mvn -s maven-settings-central.xml test")
                                && String.valueOf(variables.get("test_commands_json")).contains("cd frontend && npm run build")
                )))
                .thenReturn("""
                        {
                          "status": "FAILED",
                          "summary": "frontend 仓库测试失败",
                          "commandResults": [
                            {
                              "command": "cd frontend && npm run build",
                              "cwd": ".",
                              "exitCode": 1,
                              "stdout": "",
                              "stderr": "build failed"
                            }
                          ]
                        }
                        """);
        when(agentExecutionService.runAgent(eq(14L), any(String.class), any(Map.class)))
                .thenReturn("""
                        # 交付报告

                        frontend 仓库在执行测试阶段失败，backend 仓库未执行。
                        """);

        assertThatThrownBy(() -> developmentExecutionService.executeDevelopmentTask(executionTask, executionRun, workflowPlan))
                .isInstanceOf(DevelopmentExecutionService.DevelopmentExecutionStepException.class)
                .hasMessageContaining("frontend 仓库测试失败");

        assertThat(savedSteps)
                .extracting(ExecutionStepEntity::getStepName, ExecutionStepEntity::getStatus)
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple("执行规划", "SUCCESS"),
                        org.assertj.core.groups.Tuple.tuple("开发实现 · group/frontend", "SUCCESS"),
                        org.assertj.core.groups.Tuple.tuple("执行测试 · group/frontend", "FAILED"),
                        org.assertj.core.groups.Tuple.tuple("交付报告", "SUCCESS")
                );
        assertThat(savedArtifacts)
                .extracting(ExecutionArtifactEntity::getArtifactType)
                .containsExactly("PLAN_MARKDOWN", "IMPLEMENT_RESULT_MARKDOWN", "IMPLEMENT_RESULT_JSON", "IMPLEMENT_LOG", "REPORT_MARKDOWN");
        verify(agentExecutionService).runAgent(
                eq(13L),
                any(String.class),
                argThat(variables -> "1".equals(String.valueOf(variables.get("repo_index"))) && "2".equals(String.valueOf(variables.get("repo_total"))))
        );
    }

    /**
     * 单仓前端仓库的改动通常直接落在根目录 src/ 下，也应命中前端构建 harness，避免只跑编码检查。
     */
    @Test
    void shouldRecommendFrontendHarnessForSingleRepoFrontendChanges() {
        ExecutionTaskEntity executionTask = buildExecutionTask();
        ExecutionRunEntity executionRun = buildExecutionRun(executionTask);
        ExecutionWorkflowService.WorkflowPlan workflowPlan = buildWorkflowPlan();

        when(agentExecutionService.runAgent(eq(11L), any(String.class), any(Map.class)))
                .thenReturn("# 执行规划\n直接修改单仓前端应用。");
        when(agentExecutionService.runAgent(eq(12L), any(String.class), any(Map.class)))
                .thenReturn("""
                        {
                          "status": "SUCCESS",
                          "summary": "单仓前端改动已完成",
                          "changedFiles": ["src/views/marketing/components/ApprovalIndex.vue"],
                          "commandsExecuted": ["git diff"],
                          "log": "实现完成",
                          "workBranch": "codex/execution-99-1-1",
                          "commitSha": null,
                          "mergeRequestUrl": null
                        }
                        """);
        when(agentExecutionService.runAgent(
                eq(13L),
                any(String.class),
                argThat(variables ->
                        String.valueOf(variables.get("test_commands_json")).contains("python scripts/check_encoding.py")
                                && String.valueOf(variables.get("test_commands_json")).contains("cd frontend && npm run build")
                                && !String.valueOf(variables.get("test_commands_json")).contains("mvn -s maven-settings-central.xml test")
                )))
                .thenReturn("""
                        {
                          "status": "SUCCESS",
                          "summary": "测试通过",
                          "commandResults": []
                        }
                        """);
        when(agentExecutionService.runAgent(eq(14L), any(String.class), any(Map.class)))
                .thenReturn("""
                        # 交付报告

                        单仓前端仓库已完成开发和测试。
                        """);

        DevelopmentExecutionService.DevelopmentExecutionResult result =
                developmentExecutionService.executeDevelopmentTask(executionTask, executionRun, workflowPlan);

        assertThat(result.canceled()).isFalse();
        assertThat(result.outputSummary()).contains("单仓前端仓库已完成开发和测试");
        verify(agentExecutionService, org.mockito.Mockito.atLeastOnce()).runAgent(
                eq(13L),
                any(String.class),
                argThat(variables -> String.valueOf(variables.get("test_commands_json")).contains("cd frontend && npm run build"))
        );
    }

    /**
     * 当异步 runner 已经把步骤置为 FAILED 后，编排层后续收口必须复用同一条步骤记录，
     * 不能再次 insert 相同 stepNo，否则会撞上 run_id + step_no 唯一约束。
     */
    @Test
    void shouldReuseExistingFailedStepWhenAsyncImplementationFails() {
        ExecutionTaskEntity executionTask = buildExecutionTask();
        ExecutionRunEntity executionRun = buildExecutionRun(executionTask);
        ExecutionWorkflowService.WorkflowPlan workflowPlan = buildWorkflowPlan();

        when(agentExecutionService.runAgent(eq(11L), any(String.class), any(Map.class)))
                .thenReturn("# 执行规划\n先做 frontend，再做 backend。");
        when(agentExecutionService.runAgent(eq(14L), any(String.class), any(Map.class)))
                .thenReturn("""
                        # 交付报告

                        frontend 仓库在开发实现阶段失败，backend 仓库未执行。
                        """);
        when(agentExecutionService.supportsAsyncExecution(any(AgentEntity.class), eq("IMPLEMENT"))).thenReturn(true);
        when(agentExecutionService.supportsAsyncExecution(any(AgentEntity.class), eq("PLAN"))).thenReturn(false);
        when(agentExecutionService.supportsAsyncExecution(any(AgentEntity.class), eq("REPORT"))).thenReturn(false);
        when(agentExecutionService.startAsyncExecution(any(AgentEntity.class), any(String.class), any(Map.class), eq(15), eq(3600)))
                .thenReturn(new AgentExecutionService.AsyncExecutionStartResult("session-implement", true, "CLI", "C:/workspace", "2026-04-18T12:00:00Z"));
        doAnswer(invocation -> {
            ExecutionStepEntity step = invocation.getArgument(2);
            step.setRunnerSessionId("session-implement");
            step.setRunnerType("CLI");
            step.setHasLiveStream(true);
            return null;
        }).when(executionAsyncSessionService).bindRunnerSession(any(), any(), any(), eq("session-implement"), eq("CLI"));
        when(executionAsyncSessionService.awaitTerminalStep(any(Long.class), eq(3600))).thenAnswer(invocation -> {
            Long stepId = invocation.getArgument(0);
            ExecutionStepEntity step = savedSteps.stream()
                    .filter(item -> Objects.equals(item.getId(), stepId))
                    .findFirst()
                    .orElseThrow();
            step.setStatus("FAILED");
            step.setErrorMessage("异步实现失败");
            step.setLatestMessage("异步实现失败");
            return step;
        });

        assertThatThrownBy(() -> developmentExecutionService.executeDevelopmentTask(executionTask, executionRun, workflowPlan))
                .isInstanceOf(DevelopmentExecutionService.DevelopmentExecutionStepException.class)
                .hasMessageContaining("异步实现失败");

        List<ExecutionStepEntity> implementationSteps = savedSteps.stream()
                .filter(step -> "开发实现 · group/frontend".equals(step.getStepName()))
                .collect(Collectors.toList());
        assertThat(implementationSteps).hasSize(1);
        assertThat(implementationSteps.get(0).getStatus()).isEqualTo("FAILED");
    }

    private ExecutionTaskEntity buildExecutionTask() {
        return buildExecutionTask(false);
    }

    private ExecutionTaskEntity buildExecutionTask(boolean planConfirmationRequired) {
        ProjectEntity project = new ProjectEntity("执行中心演示项目", "张三", "进行中", "用于多仓开发执行测试");
        project.setId(11L);
        ExecutionTaskEntity executionTask = new ExecutionTaskEntity();
        executionTask.setId(99L);
        executionTask.setTitle("联动前后端开发执行");
        executionTask.setScenarioCode(ExecutionWorkflowService.SCENARIO_DEVELOPMENT_IMPLEMENTATION);
        executionTask.setProject(project);
        executionTask.setInputPayload("""
                {
                  "inputText": "请完成联调需求",
                  "planConfirmationRequired": %s,
                  "repositories": [
                    {"bindingId": 1, "targetBranch": "release/1.0"},
                    {"bindingId": 2, "targetBranch": "main"}
                  ]
                }
                """.formatted(planConfirmationRequired));
        return executionTask;
    }

    private ExecutionRunEntity buildExecutionRun(ExecutionTaskEntity executionTask) {
        ExecutionRunEntity executionRun = new ExecutionRunEntity();
        executionRun.setId(1001L);
        executionRun.setExecutionTask(executionTask);
        executionRun.setRunNo(1);
        return executionRun;
    }

    private ExecutionWorkflowService.WorkflowPlan buildWorkflowPlan() {
        return new ExecutionWorkflowService.WorkflowPlan(
                ExecutionWorkflowService.SCENARIO_DEVELOPMENT_IMPLEMENTATION,
                "开发执行",
                List.of(
                        new ExecutionWorkflowService.ExecutionStepPlan(1, "PLAN", "执行规划", buildAgent(11L, AgentExecutionService.ACCESS_BUILT_IN), null, null, null),
                        new ExecutionWorkflowService.ExecutionStepPlan(2, "IMPLEMENT", "开发实现 · group/frontend", buildAgent(12L, AgentExecutionService.ACCESS_AGENT_RUNTIME), 1L, "release/1.0", "group/frontend"),
                        new ExecutionWorkflowService.ExecutionStepPlan(3, "TEST", "执行测试 · group/frontend", buildAgent(13L, AgentExecutionService.ACCESS_HTTP_API), 1L, "release/1.0", "group/frontend"),
                        new ExecutionWorkflowService.ExecutionStepPlan(4, "IMPLEMENT", "开发实现 · group/backend", buildAgent(12L, AgentExecutionService.ACCESS_AGENT_RUNTIME), 2L, "main", "group/backend"),
                        new ExecutionWorkflowService.ExecutionStepPlan(5, "TEST", "执行测试 · group/backend", buildAgent(13L, AgentExecutionService.ACCESS_HTTP_API), 2L, "main", "group/backend"),
                        new ExecutionWorkflowService.ExecutionStepPlan(6, "REPORT", "交付报告", buildAgent(14L, AgentExecutionService.ACCESS_BUILT_IN), null, null, null)
                )
        );
    }

    private ProjectGitlabBindingEntity buildBinding(Long id, String path, String tokenCiphertext) {
        ProjectEntity project = new ProjectEntity("执行中心演示项目", "张三", "进行中", "用于多仓开发执行测试");
        project.setId(11L);
        ProjectGitlabBindingEntity binding = new ProjectGitlabBindingEntity();
        binding.setId(id);
        binding.setProject(project);
        binding.setApiBaseUrl("http://gitlab.example.com/api/v4");
        binding.setGitlabProjectRef(path);
        binding.setGitlabProjectPath(path);
        binding.setGitlabProjectWebUrl("http://gitlab.example.com/" + path);
        binding.setGitlabHttpCloneUrl("http://gitlab.example.com/" + path + ".git");
        binding.setDefaultTargetBranch("main");
        binding.setTokenCiphertext(tokenCiphertext);
        binding.setEnabled(true);
        return binding;
    }

    private AgentEntity buildAgent(Long id, String accessType) {
        AgentEntity agent = new AgentEntity();
        agent.setId(id);
        agent.setName("步骤智能体-" + id);
        agent.setType("执行");
        agent.setCategory("执行");
        agent.setStatus("在线");
        agent.setEnabled(true);
        agent.setAccessType(accessType);
        agent.setCapability("执行");
        return agent;
    }
}
