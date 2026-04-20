package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.AgentEntity;
import com.aiclub.platform.domain.model.AiModelConfigEntity;
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
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.transaction.PlatformTransactionManager;

import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 验证仓库规范扫描在引入 AI executable plan 后的关键链路。
 */
@ExtendWith(MockitoExtension.class)
class RepositoryScanExecutionServiceTests {

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
    private RepositoryScanClientService repositoryScanClientService;

    @Mock
    private RepositoryScanRulesetService repositoryScanRulesetService;

    @Mock
    private AgentExecutionService agentExecutionService;

    @Mock
    private ExecutionEventService executionEventService;

    @Mock
    private TokenCipherService tokenCipherService;

    @Mock
    private GitlabApiService gitlabApiService;

    @Mock
    private PlatformTransactionManager transactionManager;

    private RepositoryScanExecutionService repositoryScanExecutionService;

    @BeforeEach
    void setUp() {
        repositoryScanExecutionService = new RepositoryScanExecutionService(
                projectGitlabBindingRepository,
                executionStepRepository,
                executionRunRepository,
                executionArtifactRepository,
                executionTaskRepository,
                repositoryScanClientService,
                repositoryScanRulesetService,
                agentExecutionService,
                executionEventService,
                tokenCipherService,
                gitlabApiService,
                new ObjectMapper(),
                transactionManager
        );
    }

    /**
     * 配置计划智能体后，执行链路应先发布基础报告，再继续生成并发布 AI executable plan。
     */
    @Test
    void shouldPublishBaseReportBeforeBuildingExecPlan() {
        ExecutionTaskEntity executionTask = buildExecutionTask("""
                {
                  "bindingId": 1,
                  "branch": "main",
                  "rulesetCode": "team-default",
                  "planAgentId": 6,
                  "planAgentName": "扫描计划智能体",
                  "rulesetSnapshot": {
                    "code": "team-default",
                    "name": "团队默认规则集",
                    "engineType": "SEMGREP",
                    "definitionContent": "rules:\\n  - id: team.default\\n"
                  }
                }
                """);
        ExecutionRunEntity executionRun = buildExecutionRun(executionTask);
        mockCommonScanDependencies();
        AgentEntity planAgent = buildPlanAgent();
        when(agentExecutionService.loadAgent(6L)).thenReturn(planAgent);
        when(agentExecutionService.runAgent(eq(6L), any(String.class), any()))
                .thenReturn("""
                        {
                          "shardId": "report-shard-001",
                          "decision": "EXECUTE",
                          "action": "先处理后端日志输出",
                          "reason": "影响范围最集中",
                          "notes": ["先验证 backend 模块"]
                        }
                        """);
        when(repositoryScanClientService.packageExecPlan(argThat(request ->
                "SUCCESS".equals(request.execPlanStatus())
                        && request.execPlanMarkdown().contains("可执行分片")
                        && request.execPlanJson().contains("report-shard-001")
        ))).thenReturn(new RepositoryScanClientService.PackageScanResponse("仓库扫描完成，共发现 3 个问题。", List.of()));

        RepositoryScanExecutionService.RepositoryScanExecutionResult result = repositoryScanExecutionService.executeScanTask(executionTask, executionRun);

        assertThat(result.outputSummary()).isEqualTo("仓库扫描完成，共发现 3 个问题。");
        InOrder order = inOrder(repositoryScanClientService);
        order.verify(repositoryScanClientService).prepareScan(any(RepositoryScanClientService.PrepareScanRequest.class));
        order.verify(repositoryScanClientService).runSemgrep(eq("scan-99-run-1"), eq("team-default"), eq("团队默认规则集"), eq("SEMGREP"), eq("rules:\n  - id: team.default\n"));
        order.verify(repositoryScanClientService).normalizeScan("scan-99-run-1");
        order.verify(repositoryScanClientService).buildFixPlan("scan-99-run-1", "group/demo-repo");
        order.verify(repositoryScanClientService).summarizeScan("scan-99-run-1", "group/demo-repo");
        order.verify(repositoryScanClientService).packageScan(argThat(request -> request.execPlanStatus().isBlank()));
        order.verify(repositoryScanClientService).packageExecPlan(argThat(request -> "SUCCESS".equals(request.execPlanStatus())));
        verify(repositoryScanClientService).cleanupScan("scan-99-run-1");
        assertThat(result.canceled()).isFalse();
    }

    /**
     * 未配置计划智能体时，应在基础报告发布后生成 SKIPPED 占位 exec-plan。
     */
    @Test
    void shouldBuildSkippedExecPlanWhenPlanAgentIsMissing() {
        ExecutionTaskEntity executionTask = buildExecutionTask("""
                {
                  "bindingId": 1,
                  "branch": "main",
                  "rulesetCode": "team-default",
                  "rulesetSnapshot": {
                    "code": "team-default",
                    "name": "团队默认规则集",
                    "engineType": "SEMGREP",
                    "definitionContent": "rules:\\n  - id: team.default\\n"
                  }
                }
        """);
        ExecutionRunEntity executionRun = buildExecutionRun(executionTask);
        mockCommonScanDependencies();
        when(repositoryScanClientService.packageExecPlan(argThat(request ->
                "SKIPPED".equals(request.execPlanStatus())
        ))).thenReturn(new RepositoryScanClientService.PackageScanResponse("仓库扫描完成，共发现 3 个问题。", List.of()));

        RepositoryScanExecutionService.RepositoryScanExecutionResult result = repositoryScanExecutionService.executeScanTask(executionTask, executionRun);

        assertThat(result.outputSummary()).contains("占位 executable plan");
        verify(repositoryScanClientService).packageScan(argThat(request -> request.execPlanStatus().isBlank()));
        verify(repositoryScanClientService).packageExecPlan(argThat(request -> "SKIPPED".equals(request.execPlanStatus())));
        assertThat(result.canceled()).isFalse();
    }

    /**
     * 计划智能体执行异常时，应在基础报告已发布的前提下降级为 FAILED_SOFT 占位计划，不使扫描任务失败。
     */
    @Test
    void shouldFallbackToFailedSoftExecPlanWhenAgentFails() {
        ExecutionTaskEntity executionTask = buildExecutionTask("""
                {
                  "bindingId": 1,
                  "branch": "main",
                  "rulesetCode": "team-default",
                  "planAgentId": 6,
                  "planAgentName": "扫描计划智能体",
                  "rulesetSnapshot": {
                    "code": "team-default",
                    "name": "团队默认规则集",
                    "engineType": "SEMGREP",
                    "definitionContent": "rules:\\n  - id: team.default\\n"
                  }
                }
                """);
        ExecutionRunEntity executionRun = buildExecutionRun(executionTask);
        mockCommonScanDependencies();
        when(agentExecutionService.loadAgent(6L)).thenReturn(buildPlanAgent());
        when(agentExecutionService.runAgent(eq(6L), any(String.class), any()))
                .thenThrow(new IllegalStateException("模型超时"));
        when(repositoryScanClientService.packageExecPlan(argThat(request ->
                "SUCCESS".equals(request.execPlanStatus())
                        && request.execPlanMarkdown().contains("分片分析失败：模型超时")
        ))).thenReturn(new RepositoryScanClientService.PackageScanResponse("仓库扫描完成，共发现 3 个问题。", List.of()));

        RepositoryScanExecutionService.RepositoryScanExecutionResult result = repositoryScanExecutionService.executeScanTask(executionTask, executionRun);

        assertThat(result.outputSummary()).isEqualTo("仓库扫描完成，共发现 3 个问题。");
        verify(repositoryScanClientService).packageExecPlan(argThat(request -> "SUCCESS".equals(request.execPlanStatus())));
        assertThat(result.canceled()).isFalse();
    }

    /**
     * 基础报告已经发布后，若用户取消任务，当前正在执行的 AI 计划步骤应被停止，并让任务进入取消态。
     */
    @Test
    void shouldCancelTaskWhileAiPlanIsRunningAfterBaseReportPublished() {
        ExecutionTaskEntity executionTask = buildExecutionTask("""
                {
                  "bindingId": 1,
                  "branch": "main",
                  "rulesetCode": "team-default",
                  "planAgentId": 6,
                  "planAgentName": "扫描计划智能体",
                  "rulesetSnapshot": {
                    "code": "team-default",
                    "name": "团队默认规则集",
                    "engineType": "SEMGREP",
                    "definitionContent": "rules:\\n  - id: team.default\\n"
                  }
                }
                """);
        ExecutionRunEntity executionRun = buildExecutionRun(executionTask);
        mockCommonScanDependencies();
        when(agentExecutionService.loadAgent(6L)).thenReturn(buildPlanAgent());
        when(executionTaskRepository.findCancelRequestedFlagById(99L))
                .thenReturn(false)
                .thenReturn(true)
                .thenReturn(true);
        when(repositoryScanClientService.packageExecPlan(argThat(request ->
                "CANCELED".equals(request.execPlanStatus())
        ))).thenReturn(new RepositoryScanClientService.PackageScanResponse("执行已取消，已停止 AI executable plan 生成。", List.of()));

        RepositoryScanExecutionService.RepositoryScanExecutionResult result = repositoryScanExecutionService.executeScanTask(executionTask, executionRun);

        assertThat(result.canceled()).isTrue();
        verify(repositoryScanClientService).packageScan(argThat(request -> request.execPlanStatus().isBlank()));
        verify(repositoryScanClientService).packageExecPlan(argThat(request -> "CANCELED".equals(request.execPlanStatus())));
    }

    /**
     * 仓库扫描的同步步骤在等待 code-processing 返回期间，应持续补 progress 事件，
     * 避免执行详情页长时间只停留在静态 RUNNING 态。
     */
    @Test
    void shouldEmitProgressEventsWhileBlockingRepositoryScanStepIsRunning() {
        ExecutionTaskEntity executionTask = buildExecutionTask("""
                {
                  "bindingId": 1,
                  "branch": "main",
                  "rulesetCode": "team-default",
                  "rulesetSnapshot": {
                    "code": "team-default",
                    "name": "团队默认规则集",
                    "engineType": "SEMGREP",
                    "definitionContent": "rules:\\n  - id: team.default\\n"
                  }
                }
                """);
        ExecutionRunEntity executionRun = buildExecutionRun(executionTask);
        mockCommonScanDependencies();
        when(repositoryScanClientService.runSemgrep(eq("scan-99-run-1"), eq("team-default"), eq("团队默认规则集"), eq("SEMGREP"), eq("rules:\n  - id: team.default\n")))
                .thenAnswer(invocation -> {
                    Thread.sleep(3200L);
                    return new RepositoryScanClientService.SemgrepResponse(12, 3, 0, 3, 0);
                });
        when(repositoryScanClientService.packageExecPlan(argThat(request -> "SKIPPED".equals(request.execPlanStatus()))))
                .thenReturn(new RepositoryScanClientService.PackageScanResponse("仓库扫描完成，共发现 3 个问题。", List.of()));

        RepositoryScanExecutionService.RepositoryScanExecutionResult result = repositoryScanExecutionService.executeScanTask(executionTask, executionRun);

        assertThat(result.outputSummary()).contains("占位 executable plan");
        verify(executionEventService, atLeastOnce()).recordProgress(
                any(ExecutionTaskEntity.class),
                any(ExecutionRunEntity.class),
                argThat(step -> step != null && Integer.valueOf(3).equals(step.getStepNo())),
                any(Integer.class),
                contains("正在运行 Semgrep")
        );
    }

    /**
     * cleanup 接口偶发失败时，backend 应自动重试，避免扫描工作目录在 code-processing 端长期残留。
     */
    @Test
    void shouldRetryCleanupWhenFirstAttemptFails() {
        ExecutionTaskEntity executionTask = buildExecutionTask("""
                {
                  "bindingId": 1,
                  "branch": "main",
                  "rulesetCode": "team-default",
                  "rulesetSnapshot": {
                    "code": "team-default",
                    "name": "团队默认规则集",
                    "engineType": "SEMGREP",
                    "definitionContent": "rules:\\n  - id: team.default\\n"
                  }
                }
                """);
        ExecutionRunEntity executionRun = buildExecutionRun(executionTask);
        mockCommonScanDependencies();
        when(repositoryScanClientService.packageExecPlan(argThat(request -> "SKIPPED".equals(request.execPlanStatus()))))
                .thenReturn(new RepositoryScanClientService.PackageScanResponse("仓库扫描完成，共发现 3 个问题。", List.of()));
        AtomicInteger cleanupAttempts = new AtomicInteger();
        doAnswer(invocation -> {
            if (cleanupAttempts.incrementAndGet() < 3) {
                throw new IllegalStateException("目录仍被占用");
            }
            return null;
        }).when(repositoryScanClientService).cleanupScan("scan-99-run-1");

        repositoryScanExecutionService.executeScanTask(executionTask, executionRun);

        assertThat(cleanupAttempts.get()).isEqualTo(3);
        verify(repositoryScanClientService, times(3)).cleanupScan("scan-99-run-1");
    }

    /**
     * 仓库扫描不应该等到最终 package 才第一次出现产物；
     * finding index、修复计划、扫描报告这类中间结果在对应步骤完成后就应该可见。
     */
    @Test
    void shouldEmitVisibleStageArtifactsBeforeFinalPackaging() {
        ExecutionTaskEntity executionTask = buildExecutionTask("""
                {
                  "bindingId": 1,
                  "branch": "main",
                  "rulesetCode": "team-default",
                  "rulesetSnapshot": {
                    "code": "team-default",
                    "name": "团队默认规则集",
                    "engineType": "SEMGREP",
                    "definitionContent": "rules:\\n  - id: team.default\\n"
                  }
                }
                """);
        ExecutionRunEntity executionRun = buildExecutionRun(executionTask);
        mockCommonScanDependencies();
        when(repositoryScanClientService.packageExecPlan(argThat(request -> "SKIPPED".equals(request.execPlanStatus()))))
                .thenReturn(new RepositoryScanClientService.PackageScanResponse("仓库扫描完成，共发现 3 个问题。", List.of()));

        repositoryScanExecutionService.executeScanTask(executionTask, executionRun);

        verify(executionEventService).recordArtifactReady(any(ExecutionTaskEntity.class), any(ExecutionRunEntity.class), any(ExecutionStepEntity.class), any(), eq("问题索引"));
        verify(executionEventService).recordArtifactReady(any(ExecutionTaskEntity.class), any(ExecutionRunEntity.class), any(ExecutionStepEntity.class), any(), eq("修复计划 Markdown"));
        verify(executionEventService).recordArtifactReady(any(ExecutionTaskEntity.class), any(ExecutionRunEntity.class), any(ExecutionStepEntity.class), any(), eq("修复分片 Markdown"));
        verify(executionEventService).recordArtifactReady(any(ExecutionTaskEntity.class), any(ExecutionRunEntity.class), any(ExecutionStepEntity.class), any(), eq("修复分片 JSON"));
        verify(executionEventService).recordArtifactReady(any(ExecutionTaskEntity.class), any(ExecutionRunEntity.class), any(ExecutionStepEntity.class), any(), eq("扫描报告 Markdown"));
    }

    /**
     * 统一准备扫描前 6 步的基础依赖桩，方便聚焦 AI executable plan 分支行为。
     */
    private void mockCommonScanDependencies() {
        ProjectGitlabBindingEntity binding = buildBinding();
        ExecutionTaskEntity managedTask = buildExecutionTask("{}");
        managedTask.setId(99L);
        managedTask.setProject(binding.getProject());
        ExecutionRunEntity managedRun = buildExecutionRun(managedTask);
        when(projectGitlabBindingRepository.findById(1L)).thenReturn(Optional.of(binding));
        when(tokenCipherService.decrypt("cipher-token")).thenReturn("plain-token");
        when(executionStepRepository.save(any(ExecutionStepEntity.class))).thenAnswer(invocation -> {
            ExecutionStepEntity step = invocation.getArgument(0);
            if (step.getId() == null) {
                step.setId(8000L + step.getStepNo());
            }
            return step;
        });
        when(executionStepRepository.findById(any())).thenAnswer(invocation -> {
            Long stepId = invocation.getArgument(0);
            ExecutionStepEntity step = new ExecutionStepEntity();
            step.setId(stepId);
            step.setRun(managedRun);
            step.setStepNo(8);
            step.setStepCode("BUILD_EXEC_PLAN");
            step.setStepName("生成 AI 可执行计划");
            step.setStatus("RUNNING");
            return Optional.of(step);
        });
        when(executionRunRepository.save(any(ExecutionRunEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(executionRunRepository.findById(1001L)).thenAnswer(invocation -> {
            return Optional.of(managedRun);
        });
        when(executionTaskRepository.save(any(ExecutionTaskEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(executionTaskRepository.findById(99L)).thenReturn(Optional.of(managedTask));
        when(executionTaskRepository.findCancelRequestedFlagById(99L)).thenReturn(false);
        lenient().when(executionArtifactRepository.findFirstByRun_IdAndArtifactTypeAndTitle(any(), any(), any()))
                .thenReturn(Optional.empty());
        lenient().when(executionArtifactRepository.save(any(ExecutionArtifactEntity.class))).thenAnswer(invocation -> {
            ExecutionArtifactEntity artifact = invocation.getArgument(0);
            if (artifact.getId() == null) {
                artifact.setId(9000L + Math.abs(defaultArtifactKey(artifact).hashCode() % 1000));
            }
            return artifact;
        });
        when(repositoryScanClientService.prepareScan(any(RepositoryScanClientService.PrepareScanRequest.class)))
                .thenReturn(new RepositoryScanClientService.PrepareScanResponse("scan-99-run-1", "/tmp/repo", "main", "abcdef", "group/demo-repo"));
        lenient().when(repositoryScanClientService.runSemgrep(eq("scan-99-run-1"), eq("team-default"), eq("团队默认规则集"), eq("SEMGREP"), eq("rules:\n  - id: team.default\n")))
                .thenReturn(new RepositoryScanClientService.SemgrepResponse(12, 3, 0, 3, 0));
        when(repositoryScanClientService.normalizeScan("scan-99-run-1"))
                .thenReturn(new RepositoryScanClientService.NormalizeResponse("扫描完成，共发现 3 个问题，其中高风险 0 个。", 3, 0, 3, 0));
        when(repositoryScanClientService.buildFixPlan("scan-99-run-1", "group/demo-repo"))
                .thenReturn(new RepositoryScanClientService.FixPlanResponse(
                        "已生成修复计划", 3, 2, 1, 0, 1,
                        "# 修复计划",
                        "# 修复分片",
                        """
                                {
                                  "shards": [
                                    {
                                      "shardId": "backend-src-team-java-no-system-out-001"
                                    }
                                  ]
                                }
                                """
                ));
        when(repositoryScanClientService.summarizeScan("scan-99-run-1", "group/demo-repo"))
                .thenReturn(new RepositoryScanClientService.SummarizeResponse("# 扫描报告"));
        when(repositoryScanClientService.packageScan(argThat(request -> request.execPlanStatus().isBlank())))
                .thenReturn(new RepositoryScanClientService.PackageScanResponse("仓库扫描完成，共发现 3 个问题。", List.of()));
    }

    private String defaultArtifactKey(ExecutionArtifactEntity artifact) {
        return (artifact.getArtifactType() == null ? "" : artifact.getArtifactType()) + "::" + (artifact.getTitle() == null ? "" : artifact.getTitle());
    }

    /**
     * 构造带规则集快照的执行任务，避免测试依赖数据库规则集回填。
     */
    private ExecutionTaskEntity buildExecutionTask(String inputPayload) {
        ProjectEntity project = new ProjectEntity("演示项目", "张三", "进行中", "用于扫描测试");
        project.setId(11L);
        ExecutionTaskEntity executionTask = new ExecutionTaskEntity();
        executionTask.setId(99L);
        executionTask.setProject(project);
        executionTask.setInputPayload(inputPayload);
        return executionTask;
    }

    /**
     * 构造当前扫描运行实例。
     */
    private ExecutionRunEntity buildExecutionRun(ExecutionTaskEntity executionTask) {
        ExecutionRunEntity executionRun = new ExecutionRunEntity();
        executionRun.setId(1001L);
        executionRun.setExecutionTask(executionTask);
        executionRun.setRunNo(1);
        return executionRun;
    }

    /**
     * 构造已具备 HTTP clone 地址的 GitLab 绑定。
     */
    private ProjectGitlabBindingEntity buildBinding() {
        ProjectEntity project = new ProjectEntity("演示项目", "张三", "进行中", "用于扫描测试");
        project.setId(11L);
        ProjectGitlabBindingEntity binding = new ProjectGitlabBindingEntity();
        binding.setId(1L);
        binding.setProject(project);
        binding.setApiBaseUrl("http://gitlab.example.com/api/v4");
        binding.setGitlabProjectRef("group/demo-repo");
        binding.setGitlabProjectPath("group/demo-repo");
        binding.setGitlabHttpCloneUrl("http://gitlab.example.com/group/demo-repo.git");
        binding.setDefaultTargetBranch("main");
        binding.setTokenCiphertext("cipher-token");
        binding.setEnabled(true);
        return binding;
    }

    /**
     * 构造合法的仓库扫描计划智能体。
     */
    private AgentEntity buildPlanAgent() {
        AgentEntity agent = new AgentEntity();
        agent.setId(6L);
        agent.setName("扫描计划智能体");
        agent.setType("规划");
        agent.setStatus("在线");
        agent.setEnabled(true);
        agent.setAccessType(AgentExecutionService.ACCESS_BUILT_IN);
        agent.setBuiltinCode(AgentExecutionService.BUILTIN_REPOSITORY_SCAN_PLAN);
        AiModelConfigEntity modelConfig = new AiModelConfigEntity();
        modelConfig.setId(3L);
        agent.setAiModelConfig(modelConfig);
        return agent;
    }
}
