package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.ProjectGitlabBindingEntity;
import com.aiclub.platform.domain.model.TestCaseEntity;
import com.aiclub.platform.domain.model.TestPlanEntity;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 业务意图：RUN_ONLY 模式下必须先校验目标分支上的 Playwright 资产是否存在，
 * 否则到了 code-processing 才会抛"仓库中不存在自动化 Playwright 配置文件"，
 * 用户体验差且会污染执行任务列表。
 */
@ExtendWith(MockitoExtension.class)
class TestPlanAutomationServiceTests {

    @Mock
    private TestPlanAutomationPersistenceService persistenceService;

    @Mock
    private TestAutomationProfileService profileService;

    @Mock
    private ExecutionTaskService executionTaskService;

    @Mock
    private TestManagementService testManagementService;

    @Mock
    private GitlabApiService gitlabApiService;

    @Mock
    private TokenCipherService tokenCipherService;

    private TestPlanAutomationService service;

    @BeforeEach
    void setUp() {
        service = new TestPlanAutomationService(
                persistenceService,
                profileService,
                executionTaskService,
                testManagementService,
                gitlabApiService,
                tokenCipherService
        );
    }

    @Test
    void shouldRejectRunOnlyWhenConfigMissingOnTargetBranch() {
        TestPlanEntity plan = buildPlan();
        ProjectGitlabBindingEntity binding = buildBinding();
        when(persistenceService.requireVisiblePlan(1L)).thenReturn(plan);
        when(persistenceService.requireEnabledBinding(plan)).thenReturn(binding);
        when(profileService.resolveProfile(binding)).thenReturn(buildProfile());
        when(tokenCipherService.decrypt("cipher")).thenReturn("token");
        when(gitlabApiService.repositoryFileExists(
                eq("http://gitlab.example.com/api/v4"),
                eq("token"),
                eq("group/frontend"),
                eq("deploy"),
                eq(".ai-club/automation/playwright/playwright.config.ts")
        )).thenReturn(false);

        assertThatThrownBy(() -> service.runExistingAutomation(1L))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("playwright.config.ts")
                .hasMessageContaining("生成并验证");

        verify(executionTaskService, never()).createInternalExecutionTask(any());
        verify(persistenceService, never()).markQueued(any(), any(), any());
    }

    @Test
    void shouldRejectRunOnlyWhenSpecMissingOnTargetBranch() {
        TestPlanEntity plan = buildPlan();
        ProjectGitlabBindingEntity binding = buildBinding();
        when(persistenceService.requireVisiblePlan(1L)).thenReturn(plan);
        when(persistenceService.requireEnabledBinding(plan)).thenReturn(binding);
        when(profileService.resolveProfile(binding)).thenReturn(buildProfile());
        when(tokenCipherService.decrypt("cipher")).thenReturn("token");
        when(gitlabApiService.repositoryFileExists(
                eq("http://gitlab.example.com/api/v4"),
                eq("token"),
                eq("group/frontend"),
                eq("deploy"),
                eq(".ai-club/automation/playwright/playwright.config.ts")
        )).thenReturn(true);
        when(gitlabApiService.repositoryFileExists(
                eq("http://gitlab.example.com/api/v4"),
                eq("token"),
                eq("group/frontend"),
                eq("deploy"),
                eq(".ai-club/automation/playwright/plans/test-plan-1.spec.ts")
        )).thenReturn(false);

        assertThatThrownBy(() -> service.runExistingAutomation(1L))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("test-plan-1.spec.ts")
                .hasMessageContaining("生成并验证");

        verify(executionTaskService, never()).createInternalExecutionTask(any());
    }

    /**
     * GENERATE_AND_RUN 是平台自己写脚本的入口，不应该再被这条 RUN_ONLY 校验拦下来。
     */
    @Test
    void shouldNotPerformAssetCheckForGenerateAndRunMode() {
        TestPlanEntity plan = buildPlan();
        ProjectGitlabBindingEntity binding = buildBinding();
        when(persistenceService.requireVisiblePlan(1L)).thenReturn(plan);
        when(persistenceService.requireEnabledBinding(plan)).thenReturn(binding);
        when(profileService.resolveProfile(binding)).thenReturn(buildProfile());
        com.aiclub.platform.domain.model.ExecutionTaskEntity created = new com.aiclub.platform.domain.model.ExecutionTaskEntity();
        created.setId(99L);
        when(executionTaskService.createInternalExecutionTask(any())).thenReturn(created);

        service.generateAndRun(1L);

        verify(gitlabApiService, never()).repositoryFileExists(
                any(), any(String.class), any(), any(), any()
        );
        verify(persistenceService).markQueued(eq(1L), eq(99L), any());
    }

    private TestPlanEntity buildPlan() {
        ProjectEntity project = new ProjectEntity("自动化项目", "李四", "进行中", "RUN_ONLY 校验测试");
        project.setId(11L);
        TestPlanEntity plan = new TestPlanEntity();
        plan.setId(1L);
        plan.setName("登录回归");
        plan.setProject(project);
        plan.setAutomationTargetBranch("deploy");
        TestCaseEntity automated = new TestCaseEntity();
        automated.setId(31L);
        automated.setAutomationType("PLAYWRIGHT");
        plan.setCases(List.of(automated));
        return plan;
    }

    private ProjectGitlabBindingEntity buildBinding() {
        ProjectEntity project = new ProjectEntity("自动化项目", "李四", "进行中", "RUN_ONLY 校验测试");
        project.setId(11L);
        ProjectGitlabBindingEntity binding = new ProjectGitlabBindingEntity();
        binding.setId(2L);
        binding.setProject(project);
        binding.setApiBaseUrl("http://gitlab.example.com/api/v4");
        binding.setGitlabProjectRef("group/frontend");
        binding.setGitlabProjectPath("group/frontend");
        binding.setDefaultTargetBranch("main");
        binding.setTokenCiphertext("cipher");
        return binding;
    }

    private TestAutomationProfileService.AutomationProfile buildProfile() {
        return new TestAutomationProfileService.AutomationProfile(
                "FRONTEND",
                "frontend",
                "npm",
                "npm run dev",
                "http://127.0.0.1:4173",
                "#app",
                List.of("/")
        );
    }
}
