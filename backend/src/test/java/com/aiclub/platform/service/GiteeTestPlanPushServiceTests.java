package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.IterationEntity;
import com.aiclub.platform.domain.model.IterationGiteeBindingEntity;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.ProjectGiteeBindingEntity;
import com.aiclub.platform.domain.model.TestCaseEntity;
import com.aiclub.platform.domain.model.TestCaseGiteeBindingEntity;
import com.aiclub.platform.domain.model.TestCaseStepEntity;
import com.aiclub.platform.domain.model.TestPlanEntity;
import com.aiclub.platform.domain.model.TestPlanGiteeBindingEntity;
import com.aiclub.platform.dto.GiteeTestPlanPushContextSummary;
import com.aiclub.platform.dto.GiteeTestPlanPushResult;
import com.aiclub.platform.repository.IterationGiteeBindingRepository;
import com.aiclub.platform.repository.ProjectGiteeBindingRepository;
import com.aiclub.platform.repository.TestCaseRepository;
import com.aiclub.platform.repository.TestCaseGiteeBindingRepository;
import com.aiclub.platform.repository.TestPlanGiteeBindingRepository;
import com.aiclub.platform.repository.TestPlanRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.function.Supplier;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class GiteeTestPlanPushServiceTests {

    @Mock
    private TestPlanRepository testPlanRepository;

    @Mock
    private ProjectGiteeBindingRepository projectGiteeBindingRepository;

    @Mock
    private TestCaseRepository testCaseRepository;

    @Mock
    private IterationGiteeBindingRepository iterationGiteeBindingRepository;

    @Mock
    private TestPlanGiteeBindingRepository testPlanGiteeBindingRepository;

    @Mock
    private TestCaseGiteeBindingRepository testCaseGiteeBindingRepository;

    @Mock
    private ProjectDataPermissionService projectDataPermissionService;

    @Mock
    private GiteeApiService giteeApiService;

    @Mock
    private TokenCipherService tokenCipherService;

    @Mock
    private PlatformEnvVarResolver platformEnvVarResolver;

    private GiteeTestPlanPushService giteeTestPlanPushService;

    @BeforeEach
    void setUp() {
        giteeTestPlanPushService = new GiteeTestPlanPushService(
                testPlanRepository,
                testCaseRepository,
                projectGiteeBindingRepository,
                iterationGiteeBindingRepository,
                testPlanGiteeBindingRepository,
                testCaseGiteeBindingRepository,
                projectDataPermissionService,
                giteeApiService,
                tokenCipherService,
                platformEnvVarResolver,
                "9917662",
                "229413",
                "2"
        );
        lenient().when(platformEnvVarResolver.resolveOrDefault(
                org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.anyString()
        )).thenAnswer(invocation -> {
            @SuppressWarnings("unchecked")
            Supplier<String> fallbackSupplier = invocation.getArgument(1);
            String fallback = fallbackSupplier == null ? null : fallbackSupplier.get();
            return fallback == null ? invocation.getArgument(2) : fallback;
        });
        lenient().when(platformEnvVarResolver.resolve(org.mockito.ArgumentMatchers.eq(PlatformEnvVarRegistry.KEY_GITEE_BINDING_ENTERPRISE_ID), org.mockito.ArgumentMatchers.any()))
                .thenAnswer(invocation -> resolveFromLegacy(PlatformEnvVarRegistry.KEY_GITEE_BINDING_ENTERPRISE_ID, invocation.getArgument(1)));
        lenient().when(platformEnvVarResolver.resolve(org.mockito.ArgumentMatchers.eq(PlatformEnvVarRegistry.KEY_GITEE_BINDING_ACCESS_TOKEN), org.mockito.ArgumentMatchers.any()))
                .thenAnswer(invocation -> resolveFromLegacy(PlatformEnvVarRegistry.KEY_GITEE_BINDING_ACCESS_TOKEN, invocation.getArgument(1)));
        lenient().when(tokenCipherService.decrypt("cipher-token")).thenReturn("plain-token");
    }

    @Test
    void shouldCreateRemotePlanAndCasesWhenNoBindingsExist() {
        TestPlanEntity testPlan = buildTestPlan();
        ProjectGiteeBindingEntity projectBinding = buildProjectBinding(testPlan.getProject());
        IterationGiteeBindingEntity iterationBinding = buildIterationBinding(testPlan.getIteration());

        when(testPlanRepository.findGiteePushContextById(21L)).thenReturn(Optional.of(testPlan));
        when(projectGiteeBindingRepository.findByProject_Id(7L)).thenReturn(Optional.of(projectBinding));
        when(iterationGiteeBindingRepository.findByIteration_Id(12L)).thenReturn(Optional.of(iterationBinding));
        when(testCaseRepository.findAutomationCasesWithStepsByTestPlanId(21L)).thenReturn(testPlan.getCases());
        when(testPlanGiteeBindingRepository.findByTestPlan_Id(21L)).thenReturn(Optional.empty());
        when(testCaseGiteeBindingRepository.findAllByTestPlan_IdOrderByIdAsc(21L)).thenReturn(List.of());
        when(tokenCipherService.decrypt("cipher-token")).thenReturn("plain-token");
        when(giteeApiService.createTestPlan(any(), any(), any(), any()))
                .thenReturn(new GiteeApiService.GiteeRemoteTestPlan(80001L, "远端测试计划"));
        when(giteeApiService.createTestCase(any(), any(), any(), any()))
                .thenReturn(new GiteeApiService.GiteeRemoteTestCase(90001L, "远端用例A"))
                .thenReturn(new GiteeApiService.GiteeRemoteTestCase(90002L, "远端用例B"));
        when(testPlanGiteeBindingRepository.save(any(TestPlanGiteeBindingEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(testCaseGiteeBindingRepository.save(any(TestCaseGiteeBindingEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        GiteeTestPlanPushResult result = giteeTestPlanPushService.pushTestPlan(21L);

        assertThat(result.executionStatus()).isEqualTo("SUCCESS");
        assertThat(result.testPlanAction()).isEqualTo("CREATED");
        assertThat(result.remoteTestPlanId()).isEqualTo(80001L);
        assertThat(result.createdCaseCount()).isEqualTo(2);
        assertThat(result.updatedCaseCount()).isEqualTo(0);
        assertThat(result.failedCaseCount()).isEqualTo(0);

        ArgumentCaptor<TestPlanGiteeBindingEntity> planBindingCaptor = ArgumentCaptor.forClass(TestPlanGiteeBindingEntity.class);
        verify(testPlanGiteeBindingRepository).save(planBindingCaptor.capture());
        assertThat(planBindingCaptor.getValue().getGiteeTestPlanId()).isEqualTo(80001L);
        assertThat(planBindingCaptor.getValue().getLastPushStatus()).isEqualTo("SUCCESS");

        ArgumentCaptor<TestCaseGiteeBindingEntity> caseBindingCaptor = ArgumentCaptor.forClass(TestCaseGiteeBindingEntity.class);
        verify(testCaseGiteeBindingRepository, org.mockito.Mockito.times(2)).save(caseBindingCaptor.capture());
        assertThat(caseBindingCaptor.getAllValues()).extracting(TestCaseGiteeBindingEntity::getGiteeTestCaseId)
                .containsExactly(90001L, 90002L);
    }

    @Test
    void shouldUpdateRemotePlanAndCasesWhenBindingsExist() {
        TestPlanEntity testPlan = buildTestPlan();
        ProjectGiteeBindingEntity projectBinding = buildProjectBinding(testPlan.getProject());
        IterationGiteeBindingEntity iterationBinding = buildIterationBinding(testPlan.getIteration());
        TestPlanGiteeBindingEntity existingPlanBinding = new TestPlanGiteeBindingEntity();
        existingPlanBinding.setTestPlan(testPlan);
        existingPlanBinding.setProject(testPlan.getProject());
        existingPlanBinding.setIteration(testPlan.getIteration());
        existingPlanBinding.setEnterpriseId(99L);
        existingPlanBinding.setGiteeProgramId(800335L);
        existingPlanBinding.setGiteeMilestoneId(5001L);
        existingPlanBinding.setGiteeTestPlanId(80001L);

        TestCaseGiteeBindingEntity existingCaseBinding = new TestCaseGiteeBindingEntity();
        existingCaseBinding.setTestCase(testPlan.getCases().get(0));
        existingCaseBinding.setTestPlan(testPlan);
        existingCaseBinding.setProject(testPlan.getProject());
        existingCaseBinding.setIteration(testPlan.getIteration());
        existingCaseBinding.setEnterpriseId(99L);
        existingCaseBinding.setGiteeProgramId(800335L);
        existingCaseBinding.setGiteeTestPlanId(80001L);
        existingCaseBinding.setGiteeTestCaseId(90001L);

        when(testPlanRepository.findGiteePushContextById(21L)).thenReturn(Optional.of(testPlan));
        when(projectGiteeBindingRepository.findByProject_Id(7L)).thenReturn(Optional.of(projectBinding));
        when(iterationGiteeBindingRepository.findByIteration_Id(12L)).thenReturn(Optional.of(iterationBinding));
        when(testCaseRepository.findAutomationCasesWithStepsByTestPlanId(21L)).thenReturn(testPlan.getCases());
        when(testPlanGiteeBindingRepository.findByTestPlan_Id(21L)).thenReturn(Optional.of(existingPlanBinding));
        when(testCaseGiteeBindingRepository.findAllByTestPlan_IdOrderByIdAsc(21L)).thenReturn(List.of(existingCaseBinding));
        when(tokenCipherService.decrypt("cipher-token")).thenReturn("plain-token");
        when(giteeApiService.updateTestPlan(any(), any(), any(), any(), any()))
                .thenReturn(new GiteeApiService.GiteeRemoteTestPlan(80001L, "远端测试计划"));
        when(giteeApiService.updateTestCase(any(), any(), any(), any(), any()))
                .thenReturn(new GiteeApiService.GiteeRemoteTestCase(90001L, "远端用例A"));
        when(giteeApiService.createTestCase(any(), any(), any(), any()))
                .thenReturn(new GiteeApiService.GiteeRemoteTestCase(90002L, "远端用例B"));
        when(testPlanGiteeBindingRepository.save(any(TestPlanGiteeBindingEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(testCaseGiteeBindingRepository.save(any(TestCaseGiteeBindingEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        GiteeTestPlanPushResult result = giteeTestPlanPushService.pushTestPlan(21L);

        assertThat(result.executionStatus()).isEqualTo("SUCCESS");
        assertThat(result.testPlanAction()).isEqualTo("UPDATED");
        assertThat(result.createdCaseCount()).isEqualTo(1);
        assertThat(result.updatedCaseCount()).isEqualTo(1);
        assertThat(result.failedCaseCount()).isEqualTo(0);
    }

    @Test
    void shouldReturnPartialWhenSomeCasesFailDuringPush() {
        TestPlanEntity testPlan = buildTestPlan();
        ProjectGiteeBindingEntity projectBinding = buildProjectBinding(testPlan.getProject());
        IterationGiteeBindingEntity iterationBinding = buildIterationBinding(testPlan.getIteration());

        when(testPlanRepository.findGiteePushContextById(21L)).thenReturn(Optional.of(testPlan));
        when(projectGiteeBindingRepository.findByProject_Id(7L)).thenReturn(Optional.of(projectBinding));
        when(iterationGiteeBindingRepository.findByIteration_Id(12L)).thenReturn(Optional.of(iterationBinding));
        when(testCaseRepository.findAutomationCasesWithStepsByTestPlanId(21L)).thenReturn(testPlan.getCases());
        when(testPlanGiteeBindingRepository.findByTestPlan_Id(21L)).thenReturn(Optional.empty());
        when(testCaseGiteeBindingRepository.findAllByTestPlan_IdOrderByIdAsc(21L)).thenReturn(List.of());
        when(tokenCipherService.decrypt("cipher-token")).thenReturn("plain-token");
        when(giteeApiService.createTestPlan(any(), any(), any(), any()))
                .thenReturn(new GiteeApiService.GiteeRemoteTestPlan(80001L, "远端测试计划"));
        when(giteeApiService.createTestCase(any(), any(), any(), any()))
                .thenReturn(new GiteeApiService.GiteeRemoteTestCase(90001L, "远端用例A"))
                .thenThrow(new IllegalStateException("远端模块不存在"));
        when(testPlanGiteeBindingRepository.save(any(TestPlanGiteeBindingEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(testCaseGiteeBindingRepository.save(any(TestCaseGiteeBindingEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        GiteeTestPlanPushResult result = giteeTestPlanPushService.pushTestPlan(21L);

        assertThat(result.executionStatus()).isEqualTo("PARTIAL");
        assertThat(result.createdCaseCount()).isEqualTo(1);
        assertThat(result.updatedCaseCount()).isEqualTo(0);
        assertThat(result.failedCaseCount()).isEqualTo(1);
    }

    @Test
    void shouldReturnDisabledReasonWhenIterationDateMissing() {
        TestPlanEntity testPlan = buildTestPlan();
        testPlan.setStartDate(null);
        testPlan.setEndDate(null);
        testPlan.getIteration().setStartDate(null);
        testPlan.getIteration().setEndDate(null);
        ProjectGiteeBindingEntity projectBinding = buildProjectBinding(testPlan.getProject());
        IterationGiteeBindingEntity iterationBinding = buildIterationBinding(testPlan.getIteration());

        when(testPlanRepository.findGiteePushContextById(21L)).thenReturn(Optional.of(testPlan));
        when(projectGiteeBindingRepository.findByProject_Id(7L)).thenReturn(Optional.of(projectBinding));
        when(iterationGiteeBindingRepository.findByIteration_Id(12L)).thenReturn(Optional.of(iterationBinding));

        GiteeTestPlanPushContextSummary context = giteeTestPlanPushService.getPushContext(21L);

        assertThat(context.pushable()).isFalse();
        assertThat(context.disabledReason()).isEqualTo("当前测试计划未配置开始日期或结束日期，且所属迭代也没有可继承的时间");
        assertThatThrownBy(() -> giteeTestPlanPushService.pushTestPlan(21L))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("当前测试计划未配置开始日期或结束日期，且所属迭代也没有可继承的时间");
    }

    @Test
    void shouldPreferPlanScheduleWhenPushingToGitee() {
        TestPlanEntity testPlan = buildTestPlan();
        testPlan.setStartDate(LocalDate.of(2026, 5, 6));
        testPlan.setEndDate(LocalDate.of(2026, 5, 18));
        testPlan.getIteration().setStartDate(LocalDate.of(2026, 4, 30));
        testPlan.getIteration().setEndDate(LocalDate.of(2026, 5, 30));
        ProjectGiteeBindingEntity projectBinding = buildProjectBinding(testPlan.getProject());
        IterationGiteeBindingEntity iterationBinding = buildIterationBinding(testPlan.getIteration());

        when(testPlanRepository.findGiteePushContextById(21L)).thenReturn(Optional.of(testPlan));
        when(projectGiteeBindingRepository.findByProject_Id(7L)).thenReturn(Optional.of(projectBinding));
        when(iterationGiteeBindingRepository.findByIteration_Id(12L)).thenReturn(Optional.of(iterationBinding));
        when(testCaseRepository.findAutomationCasesWithStepsByTestPlanId(21L)).thenReturn(testPlan.getCases());
        when(testPlanGiteeBindingRepository.findByTestPlan_Id(21L)).thenReturn(Optional.empty());
        when(testCaseGiteeBindingRepository.findAllByTestPlan_IdOrderByIdAsc(21L)).thenReturn(List.of());
        when(tokenCipherService.decrypt("cipher-token")).thenReturn("plain-token");
        when(giteeApiService.createTestPlan(any(), any(), any(), any()))
                .thenReturn(new GiteeApiService.GiteeRemoteTestPlan(80001L, "远端测试计划"));
        when(giteeApiService.createTestCase(any(), any(), any(), any()))
                .thenReturn(new GiteeApiService.GiteeRemoteTestCase(90001L, "远端用例A"))
                .thenReturn(new GiteeApiService.GiteeRemoteTestCase(90002L, "远端用例B"));
        when(testPlanGiteeBindingRepository.save(any(TestPlanGiteeBindingEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(testCaseGiteeBindingRepository.save(any(TestCaseGiteeBindingEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        giteeTestPlanPushService.pushTestPlan(21L);

        ArgumentCaptor<GiteeApiService.GiteeTestPlanRequest> requestCaptor = ArgumentCaptor.forClass(GiteeApiService.GiteeTestPlanRequest.class);
        verify(giteeApiService).createTestPlan(any(), any(), any(), requestCaptor.capture());
        assertThat(requestCaptor.getValue().start_date()).contains("2026-05-06T00:00:00");
        assertThat(requestCaptor.getValue().end_date()).contains("2026-05-18T23:59:59");
    }

    private TestPlanEntity buildTestPlan() {
        ProjectEntity project = new ProjectEntity();
        project.setId(7L);
        project.setName("项目A");
        project.setOwner("负责人");
        project.setStatus("进行中");
        project.setDescription("项目描述");

        IterationEntity iteration = new IterationEntity();
        iteration.setId(12L);
        iteration.setProject(project);
        iteration.setName("迭代A");
        iteration.setStatus("进行中");
        iteration.setStartDate(LocalDate.of(2026, 4, 30));
        iteration.setEndDate(LocalDate.of(2026, 5, 30));

        TestPlanEntity testPlan = new TestPlanEntity();
        testPlan.setId(21L);
        testPlan.setName("测试计划A");
        testPlan.setProject(project);
        testPlan.setIteration(iteration);
        testPlan.setStatus("草稿");
        testPlan.setDescription("测试计划描述");
        testPlan.setStartDate(iteration.getStartDate());
        testPlan.setEndDate(iteration.getEndDate());
        testPlan.setCases(new ArrayList<>());

        testPlan.getCases().add(buildTestCase(testPlan, 31L, "登录测试", "P0", 0));
        testPlan.getCases().add(buildTestCase(testPlan, 32L, "审批测试", "P2", 1));
        return testPlan;
    }

    private TestCaseEntity buildTestCase(TestPlanEntity testPlan, Long id, String title, String priority, int sortOrder) {
        TestCaseEntity testCase = new TestCaseEntity();
        testCase.setId(id);
        testCase.setTestPlan(testPlan);
        testCase.setTitle(title);
        testCase.setModuleName("模块" + sortOrder);
        testCase.setCaseType("功能测试");
        testCase.setPriority(priority);
        testCase.setPrecondition("前置条件");
        testCase.setRemarks("备注");
        testCase.setSortOrder(sortOrder);
        testCase.setSteps(new ArrayList<>());
        testCase.getSteps().add(buildStep(testCase, 1, "步骤1", "结果1"));
        return testCase;
    }

    private TestCaseStepEntity buildStep(TestCaseEntity testCase, int stepNo, String action, String expectedResult) {
        TestCaseStepEntity step = new TestCaseStepEntity();
        step.setTestCase(testCase);
        step.setStepNo(stepNo);
        step.setAction(action);
        step.setExpectedResult(expectedResult);
        return step;
    }

    private ProjectGiteeBindingEntity buildProjectBinding(ProjectEntity project) {
        ProjectGiteeBindingEntity binding = new ProjectGiteeBindingEntity();
        binding.setId(1L);
        binding.setProject(project);
        binding.setEnterpriseId(99L);
        binding.setApiBaseUrl("https://api.gitee.com/enterprises");
        binding.setAccessTokenCiphertext("cipher-token");
        binding.setGiteeProgramId(800335L);
        binding.setGiteeProgramName("远端项目");
        binding.setEnabled(true);
        return binding;
    }

    private IterationGiteeBindingEntity buildIterationBinding(IterationEntity iteration) {
        IterationGiteeBindingEntity binding = new IterationGiteeBindingEntity();
        binding.setId(2L);
        binding.setIteration(iteration);
        binding.setProject(iteration.getProject());
        binding.setGiteeMilestoneId(5001L);
        binding.setGiteeMilestoneTitle("远端迭代");
        return binding;
    }

    @SuppressWarnings("unchecked")
    private PlatformEnvVarResolver.PlatformEnvVarResolvedValue resolveFromLegacy(String envKey, Object supplierArg) {
        Supplier<String> supplier = (Supplier<String>) supplierArg;
        String value = supplier == null ? null : supplier.get();
        if (value == null || value.trim().isEmpty()) {
            throw new IllegalStateException(envKey + "未配置");
        }
        return new PlatformEnvVarResolver.PlatformEnvVarResolvedValue(
                envKey,
                value,
                PlatformEnvVarRegistry.EFFECTIVE_SOURCE_TYPE_LEGACY
        );
    }
}
