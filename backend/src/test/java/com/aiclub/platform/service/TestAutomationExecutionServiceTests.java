package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ExecutionArtifactEntity;
import com.aiclub.platform.domain.model.ExecutionRunEntity;
import com.aiclub.platform.domain.model.ExecutionStepEntity;
import com.aiclub.platform.domain.model.ExecutionTaskEntity;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.ProjectGitlabBindingEntity;
import com.aiclub.platform.domain.model.TestCaseEntity;
import com.aiclub.platform.domain.model.TestPlanEntity;
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
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 覆盖自动化执行 repo-suite 异步路径对 runner 工作区目录的透传绑定，
 * 避免 code-processing 回传了 workspaceRoot 后，后端遗漏登记导致无法统一清理。
 */
@ExtendWith(MockitoExtension.class)
class TestAutomationExecutionServiceTests {

    @Mock
    private ExecutionStepRepository executionStepRepository;

    @Mock
    private ExecutionRunRepository executionRunRepository;

    @Mock
    private ExecutionTaskRepository executionTaskRepository;

    @Mock
    private ExecutionArtifactRepository executionArtifactRepository;

    @Mock
    private ExecutionEventService executionEventService;

    @Mock
    private ExecutionAsyncSessionService executionAsyncSessionService;

    @Mock
    private TestPlanAutomationPersistenceService automationPersistenceService;

    @Mock
    private ProjectGitlabBindingRepository projectGitlabBindingRepository;

    @Mock
    private TestAutomationProfileService profileService;

    @Mock
    private TestAutomationScriptTemplateService templateService;

    @Mock
    private GitlabApiService gitlabApiService;

    @Mock
    private TokenCipherService tokenCipherService;

    @Mock
    private CodeProcessingCliExecutionClientService cliExecutionClientService;

    private TestAutomationExecutionService testAutomationExecutionService;

    @BeforeEach
    void setUp() {
        testAutomationExecutionService = new TestAutomationExecutionService(
                executionStepRepository,
                executionRunRepository,
                executionTaskRepository,
                executionArtifactRepository,
                executionEventService,
                executionAsyncSessionService,
                automationPersistenceService,
                projectGitlabBindingRepository,
                profileService,
                templateService,
                gitlabApiService,
                tokenCipherService,
                cliExecutionClientService,
                new ObjectMapper()
        );
    }

    /**
     * repo-suite 由 code-processing 在独立 runner 工作区内执行时，
     * 后端必须把 workspaceRoot 透传给会话绑定，才能让后续统一终态清理准确命中该目录。
     */
    @Test
    void shouldBindWorkspaceRootWhenRepoSuiteStartsAsynchronously() {
        ExecutionTaskEntity executionTask = buildExecutionTask();
        ExecutionRunEntity executionRun = buildExecutionRun(executionTask);
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

        TestPlanEntity plan = buildTestPlan();
        TestCaseEntity automatedCase = buildAutomatedCase(plan);
        ProjectGitlabBindingEntity binding = buildBinding();
        TestAutomationProfileService.AutomationProfile profile = new TestAutomationProfileService.AutomationProfile(
                "FRONTEND",
                "frontend",
                "npm",
                "npm run dev",
                "http://127.0.0.1:4173",
                "#app",
                List.of("/")
        );
        TestAutomationScriptTemplateService.GeneratedScriptBundle scriptBundle =
                new TestAutomationScriptTemplateService.GeneratedScriptBundle(
                        "test-plan-501",
                        "playwright.config.ts",
                        "tests/generated/demo.spec.ts",
                        "manifest.json",
                        Map.of("manifest.json", "{\"generated\":true}"),
                        1
                );

        when(automationPersistenceService.requirePlanWithAutomationContext(501L)).thenReturn(plan);
        when(automationPersistenceService.listCasesWithSteps(501L)).thenReturn(List.of(automatedCase));
        when(projectGitlabBindingRepository.findById(601L)).thenReturn(Optional.of(binding));
        when(profileService.resolveProfile(binding)).thenReturn(profile);
        when(profileService.resolveDefaultPath(profile)).thenReturn("/");
        when(profileService.resolveReadySelector(profile)).thenReturn("#app");
        when(templateService.generate(plan, binding, profile, "main", "ai-club/test-automation/plan-501-run-701", List.of(automatedCase)))
                .thenReturn(scriptBundle);
        when(executionStepRepository.save(any(ExecutionStepEntity.class))).thenAnswer(invocation -> {
            ExecutionStepEntity step = invocation.getArgument(0);
            if (step.getId() == null) {
                step.setId(8000L + step.getStepNo());
            }
            return step;
        });
        when(executionRunRepository.save(any(ExecutionRunEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(executionTaskRepository.save(any(ExecutionTaskEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(executionArtifactRepository.save(any(ExecutionArtifactEntity.class))).thenAnswer(invocation -> {
            ExecutionArtifactEntity artifact = invocation.getArgument(0);
            if (artifact.getId() == null) {
                artifact.setId(9000L);
            }
            return artifact;
        });
        when(tokenCipherService.decrypt("cipher-automation")).thenReturn("token-automation");
        when(executionAsyncSessionService.maxRuntimeSeconds("TEST")).thenReturn(600);
        when(cliExecutionClientService.startExecution(any(Map.class))).thenReturn(
                new CodeProcessingCliExecutionClientService.ExecutionSessionAcceptedResponse(
                        "repo-suite-session-1",
                        true,
                        "CLI",
                        "C:/workspace/test-automation",
                        "2026-05-04T14:30:00Z"
                )
        );
        when(executionAsyncSessionService.awaitTerminalStep(anyLong(), eq(600))).thenAnswer(invocation -> {
            ExecutionStepEntity step = new ExecutionStepEntity();
            step.setId(invocation.getArgument(0));
            step.setStatus("SUCCESS");
            step.setOutputSnapshot("""
                    {
                      "status": "SUCCESS",
                      "summary": "自动化执行完成",
                      "suiteResults": []
                    }
                    """);
            return step;
        });

        TestAutomationExecutionService.TestAutomationExecutionResult result =
                testAutomationExecutionService.executeAutomationTask(executionTask, executionRun, workflowPlan);

        assertThat(result.canceled()).isFalse();
        verify(executionAsyncSessionService).bindRunnerSession(
                eq(executionTask),
                eq(executionRun),
                any(ExecutionStepEntity.class),
                eq("repo-suite-session-1"),
                eq("CLI"),
                eq("C:/workspace/test-automation")
        );
    }

    private ExecutionTaskEntity buildExecutionTask() {
        ProjectEntity project = new ProjectEntity("自动化项目", "李四", "进行中", "用于自动化执行测试");
        project.setId(11L);

        ExecutionTaskEntity executionTask = new ExecutionTaskEntity();
        executionTask.setId(99L);
        executionTask.setProject(project);
        executionTask.setScenarioCode(ExecutionWorkflowService.SCENARIO_TEST_AUTOMATION);
        executionTask.setTitle("自动化测试执行");
        executionTask.setInputPayload("""
                {
                  "mode": "RUN_ONLY",
                  "testPlanId": 501,
                  "bindingId": 601,
                  "targetBranch": "main"
                }
                """);
        return executionTask;
    }

    private ExecutionRunEntity buildExecutionRun(ExecutionTaskEntity executionTask) {
        ExecutionRunEntity executionRun = new ExecutionRunEntity();
        executionRun.setId(701L);
        executionRun.setRunNo(1);
        executionRun.setExecutionTask(executionTask);
        return executionRun;
    }

    private TestPlanEntity buildTestPlan() {
        ProjectEntity project = new ProjectEntity("自动化项目", "李四", "进行中", "用于自动化执行测试");
        project.setId(11L);

        TestPlanEntity plan = new TestPlanEntity();
        plan.setId(501L);
        plan.setName("核心流程回归");
        plan.setProject(project);
        return plan;
    }

    private TestCaseEntity buildAutomatedCase(TestPlanEntity plan) {
        TestCaseEntity testCase = new TestCaseEntity();
        testCase.setId(801L);
        testCase.setTestPlan(plan);
        testCase.setTitle("登录页可正常访问");
        testCase.setModuleName("登录");
        testCase.setAutomationType("PLAYWRIGHT");
        testCase.setAutomationHint("访问首页并检查登录表单");
        return testCase;
    }

    private ProjectGitlabBindingEntity buildBinding() {
        ProjectEntity project = new ProjectEntity("自动化项目", "李四", "进行中", "用于自动化执行测试");
        project.setId(11L);

        ProjectGitlabBindingEntity binding = new ProjectGitlabBindingEntity();
        binding.setId(601L);
        binding.setProject(project);
        binding.setApiBaseUrl("http://gitlab.example.com/api/v4");
        binding.setGitlabProjectRef("group/frontend");
        binding.setGitlabProjectPath("group/frontend");
        binding.setGitlabProjectWebUrl("http://gitlab.example.com/group/frontend");
        binding.setGitlabHttpCloneUrl("http://gitlab.example.com/group/frontend.git");
        binding.setDefaultTargetBranch("main");
        binding.setTokenCiphertext("cipher-automation");
        return binding;
    }
}
