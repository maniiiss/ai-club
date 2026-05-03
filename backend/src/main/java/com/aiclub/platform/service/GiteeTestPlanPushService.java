package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.IterationGiteeBindingEntity;
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
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.NoSuchElementException;

/**
 * 向 Gitee 单向推送测试计划与测试用例。
 * V1 只做新增和更新，不处理远端删除，也不维护远端计划与用例的关联关系。
 */
@Service
@Transactional(readOnly = true)
public class GiteeTestPlanPushService {

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final DateTimeFormatter ISO_OFFSET_TIME_FORMATTER = DateTimeFormatter.ISO_OFFSET_DATE_TIME;
    private static final ZoneId SHANGHAI_ZONE_ID = ZoneId.of("Asia/Shanghai");
    private static final String STATUS_SUCCESS = "SUCCESS";
    private static final String STATUS_PARTIAL = "PARTIAL";
    private static final String STATUS_FAILED = "FAILED";
    private static final String ACTION_CREATED = "CREATED";
    private static final String ACTION_UPDATED = "UPDATED";
    private static final String PLAN_REF_TYPE = "sprint";

    private final TestPlanRepository testPlanRepository;
    private final TestCaseRepository testCaseRepository;
    private final ProjectGiteeBindingRepository projectGiteeBindingRepository;
    private final IterationGiteeBindingRepository iterationGiteeBindingRepository;
    private final TestPlanGiteeBindingRepository testPlanGiteeBindingRepository;
    private final TestCaseGiteeBindingRepository testCaseGiteeBindingRepository;
    private final ProjectDataPermissionService projectDataPermissionService;
    private final GiteeApiService giteeApiService;
    private final TokenCipherService tokenCipherService;
    private final long testPlanAssigneeId;
    private final long testCaseModuleId;
    private final int testCaseType;
    @Value("${platform.gitee.default-api-url:https://api.gitee.com/enterprises}")
    private String defaultApiUrl = "";
    @Value("${platform.gitee.binding.enterprise-id:0}")
    private long configuredEnterpriseId = 0L;
    @Value("${platform.gitee.binding.access-token:}")
    private String configuredAccessToken = "";

    public GiteeTestPlanPushService(TestPlanRepository testPlanRepository,
                                    TestCaseRepository testCaseRepository,
                                    ProjectGiteeBindingRepository projectGiteeBindingRepository,
                                    IterationGiteeBindingRepository iterationGiteeBindingRepository,
                                    TestPlanGiteeBindingRepository testPlanGiteeBindingRepository,
                                    TestCaseGiteeBindingRepository testCaseGiteeBindingRepository,
                                    ProjectDataPermissionService projectDataPermissionService,
                                    GiteeApiService giteeApiService,
                                    TokenCipherService tokenCipherService,
                                    @Value("${platform.gitee.test-push.test-plan-assignee-id:9917662}") long testPlanAssigneeId,
                                    @Value("${platform.gitee.test-push.test-case-module-id:229413}") long testCaseModuleId,
                                    @Value("${platform.gitee.test-push.test-case-type:2}") int testCaseType) {
        this.testPlanRepository = testPlanRepository;
        this.testCaseRepository = testCaseRepository;
        this.projectGiteeBindingRepository = projectGiteeBindingRepository;
        this.iterationGiteeBindingRepository = iterationGiteeBindingRepository;
        this.testPlanGiteeBindingRepository = testPlanGiteeBindingRepository;
        this.testCaseGiteeBindingRepository = testCaseGiteeBindingRepository;
        this.projectDataPermissionService = projectDataPermissionService;
        this.giteeApiService = giteeApiService;
        this.tokenCipherService = tokenCipherService;
        this.testPlanAssigneeId = testPlanAssigneeId;
        this.testCaseModuleId = testCaseModuleId;
        this.testCaseType = testCaseType;
    }

    public GiteeTestPlanPushContextSummary getPushContext(Long testPlanId) {
        TestPlanEntity testPlan = requireTestPlan(testPlanId);
        TestPlanGiteeBindingEntity binding = testPlanGiteeBindingRepository.findByTestPlan_Id(testPlanId).orElse(null);
        String disabledReason = resolveDisabledReason(testPlan);
        return new GiteeTestPlanPushContextSummary(
                testPlan.getId(),
                disabledReason == null,
                disabledReason,
                binding == null ? null : binding.getGiteeTestPlanId(),
                binding == null ? null : binding.getLastPushStatus(),
                binding == null ? null : binding.getLastPushMessage(),
                formatTime(binding == null ? null : binding.getLastPushedAt())
        );
    }

    @Transactional
    public GiteeTestPlanPushResult pushTestPlan(Long testPlanId) {
        TestPlanEntity testPlan = requirePushContext(testPlanId);
        ProjectGiteeBindingEntity projectBinding = requireEnabledProjectBinding(testPlan.getProject().getId());
        IterationGiteeBindingEntity iterationBinding = requireIterationBinding(testPlan.getIteration().getId());
        List<TestCaseEntity> testCases = testCaseRepository.findAutomationCasesWithStepsByTestPlanId(testPlanId);
        TestPlanGiteeBindingEntity existingPlanBinding = testPlanGiteeBindingRepository.findByTestPlan_Id(testPlanId).orElse(null);
        Map<Long, TestCaseGiteeBindingEntity> caseBindingsByCaseId = new HashMap<>();
        testCaseGiteeBindingRepository.findAllByTestPlan_IdOrderByIdAsc(testPlanId)
                .forEach(item -> caseBindingsByCaseId.put(item.getTestCase().getId(), item));

        LocalDateTime executedAt = LocalDateTime.now();
        String accessToken = resolveAccessToken(projectBinding);
        Long enterpriseId = resolveEnterpriseId(projectBinding);
        String apiBaseUrl = resolveApiBaseUrl(projectBinding);

        Long remoteTestPlanId = existingPlanBinding == null ? null : existingPlanBinding.getGiteeTestPlanId();
        String testPlanAction = remoteTestPlanId == null ? ACTION_CREATED : ACTION_UPDATED;
        int createdCaseCount = 0;
        int updatedCaseCount = 0;
        int failedCaseCount = 0;

        try {
            GiteeApiService.GiteeTestPlanRequest planRequest = buildPlanRequest(testPlan, projectBinding);
            GiteeApiService.GiteeRemoteTestPlan remotePlan = remoteTestPlanId == null
                    ? giteeApiService.createTestPlan(apiBaseUrl, accessToken, enterpriseId, planRequest)
                    : giteeApiService.updateTestPlan(apiBaseUrl, accessToken, enterpriseId, remoteTestPlanId, planRequest);
            remoteTestPlanId = remotePlan.id();

            for (TestCaseEntity testCase : testCases) {
                GiteeApiService.GiteeTestCaseRequest testCaseRequest = buildTestCaseRequest(testCase, projectBinding);
                TestCaseGiteeBindingEntity existingCaseBinding = caseBindingsByCaseId.get(testCase.getId());
                try {
                    if (existingCaseBinding == null) {
                        GiteeApiService.GiteeRemoteTestCase remoteTestCase = giteeApiService.createTestCase(
                                apiBaseUrl,
                                accessToken,
                                enterpriseId,
                                testCaseRequest
                        );
                        TestCaseGiteeBindingEntity createdBinding = new TestCaseGiteeBindingEntity();
                        fillCaseBinding(createdBinding, testCase, testPlan, projectBinding, iterationBinding, remoteTestPlanId, remoteTestCase.id(), executedAt);
                        testCaseGiteeBindingRepository.save(createdBinding);
                        createdCaseCount++;
                    } else {
                        giteeApiService.updateTestCase(
                                apiBaseUrl,
                                accessToken,
                                enterpriseId,
                                existingCaseBinding.getGiteeTestCaseId(),
                                testCaseRequest
                        );
                        fillCaseBinding(existingCaseBinding, testCase, testPlan, projectBinding, iterationBinding, remoteTestPlanId, existingCaseBinding.getGiteeTestCaseId(), executedAt);
                        testCaseGiteeBindingRepository.save(existingCaseBinding);
                        updatedCaseCount++;
                    }
                } catch (RuntimeException exception) {
                    failedCaseCount++;
                }
            }

            String executionStatus = failedCaseCount > 0 ? STATUS_PARTIAL : STATUS_SUCCESS;
            String summaryMessage = buildSummaryMessage(testPlanAction, createdCaseCount, updatedCaseCount, failedCaseCount);
            savePlanBinding(existingPlanBinding, testPlan, projectBinding, iterationBinding, remoteTestPlanId, executionStatus, summaryMessage, executedAt);
            return new GiteeTestPlanPushResult(
                    executionStatus,
                    testPlanAction,
                    remoteTestPlanId,
                    createdCaseCount,
                    updatedCaseCount,
                    failedCaseCount,
                    summaryMessage,
                    formatTime(executedAt)
            );
        } catch (RuntimeException exception) {
            String summaryMessage = limitMessage(exception.getMessage());
            if (remoteTestPlanId != null || existingPlanBinding != null) {
                savePlanBinding(existingPlanBinding, testPlan, projectBinding, iterationBinding, remoteTestPlanId, STATUS_FAILED, summaryMessage, executedAt);
            }
            return new GiteeTestPlanPushResult(
                    STATUS_FAILED,
                    testPlanAction,
                    remoteTestPlanId,
                    createdCaseCount,
                    updatedCaseCount,
                    failedCaseCount,
                    summaryMessage,
                    formatTime(executedAt)
            );
        }
    }

    private TestPlanEntity requirePushContext(Long testPlanId) {
        TestPlanEntity testPlan = testPlanRepository.findGiteePushContextById(testPlanId)
                .orElseThrow(() -> new NoSuchElementException("测试计划不存在: " + testPlanId));
        projectDataPermissionService.requireProjectVisible(testPlan.getProject());
        String disabledReason = resolveDisabledReason(testPlan);
        if (disabledReason != null) {
            throw new IllegalStateException(disabledReason);
        }
        return testPlan;
    }

    private TestPlanEntity requireTestPlan(Long testPlanId) {
        TestPlanEntity testPlan = testPlanRepository.findGiteePushContextById(testPlanId)
                .orElseThrow(() -> new NoSuchElementException("测试计划不存在: " + testPlanId));
        projectDataPermissionService.requireProjectVisible(testPlan.getProject());
        return testPlan;
    }

    private ProjectGiteeBindingEntity requireEnabledProjectBinding(Long projectId) {
        ProjectGiteeBindingEntity binding = projectGiteeBindingRepository.findByProject_Id(projectId)
                .orElseThrow(() -> new NoSuchElementException("当前项目尚未绑定 Gitee 项目"));
        if (!Boolean.TRUE.equals(binding.getEnabled())) {
            throw new IllegalStateException("当前项目的 Gitee 绑定已停用");
        }
        if (!hasText(configuredAccessToken) && !hasText(binding.getAccessTokenCiphertext())) {
            throw new IllegalStateException("当前项目的 Gitee 绑定缺少 Access Token");
        }
        return binding;
    }

    private IterationGiteeBindingEntity requireIterationBinding(Long iterationId) {
        return iterationGiteeBindingRepository.findByIteration_Id(iterationId)
                .orElseThrow(() -> new NoSuchElementException("当前测试计划所属迭代尚未绑定 Gitee 迭代"));
    }

    private String resolveDisabledReason(TestPlanEntity testPlan) {
        if (testPlan.getIteration() == null) {
            return "当前测试计划未关联迭代";
        }
        ProjectGiteeBindingEntity projectBinding = projectGiteeBindingRepository.findByProject_Id(testPlan.getProject().getId()).orElse(null);
        if (projectBinding == null) {
            return "当前项目尚未绑定 Gitee 项目";
        }
        if (!Boolean.TRUE.equals(projectBinding.getEnabled())) {
            return "当前项目的 Gitee 绑定已停用";
        }
        if (!hasText(configuredAccessToken) && !hasText(projectBinding.getAccessTokenCiphertext())) {
            return "当前项目的 Gitee 绑定缺少 Access Token";
        }
        if (iterationGiteeBindingRepository.findByIteration_Id(testPlan.getIteration().getId()).isEmpty()) {
            return "当前测试计划所属迭代尚未绑定 Gitee 迭代";
        }
        if (resolvePlannedStartDate(testPlan) == null || resolvePlannedEndDate(testPlan) == null) {
            return "当前测试计划未配置开始日期或结束日期，且所属迭代也没有可继承的时间";
        }
        return null;
    }

    /**
     * 测试计划推送与项目管理页共用同一套企业级 Gitee 配置，避免项目保存后推送链路仍继续读旧库数据。
     */
    private String resolveApiBaseUrl(ProjectGiteeBindingEntity projectBinding) {
        boolean useConfiguredApiBaseUrl = hasText(defaultApiUrl);
        String resolved = useConfiguredApiBaseUrl ? defaultApiUrl.trim() : projectBinding.getApiBaseUrl();
        if (!hasText(resolved)) {
            throw new IllegalStateException("当前项目的 Gitee 绑定缺少 API 地址配置");
        }
        while (resolved.endsWith("/")) {
            resolved = resolved.substring(0, resolved.length() - 1);
        }
        return useConfiguredApiBaseUrl ? giteeApiService.normalizeEnterpriseApiBaseUrl(resolved) : resolved;
    }

    private Long resolveEnterpriseId(ProjectGiteeBindingEntity projectBinding) {
        if (configuredEnterpriseId > 0) {
            return configuredEnterpriseId;
        }
        if (projectBinding.getEnterpriseId() != null) {
            return projectBinding.getEnterpriseId();
        }
        throw new IllegalStateException("当前项目的 Gitee 绑定缺少企业 ID 配置");
    }

    private String resolveAccessToken(ProjectGiteeBindingEntity projectBinding) {
        if (hasText(configuredAccessToken)) {
            return configuredAccessToken.trim();
        }
        if (hasText(projectBinding.getAccessTokenCiphertext())) {
            return tokenCipherService.decrypt(projectBinding.getAccessTokenCiphertext());
        }
        throw new IllegalStateException("当前项目的 Gitee 绑定缺少 Access Token 配置");
    }

    private GiteeApiService.GiteeTestPlanRequest buildPlanRequest(TestPlanEntity testPlan, ProjectGiteeBindingEntity projectBinding) {
        LocalDate startDate = resolvePlannedStartDate(testPlan);
        LocalDate endDate = resolvePlannedEndDate(testPlan);
        if (startDate == null || endDate == null) {
            throw new IllegalStateException("当前测试计划未配置开始日期或结束日期，且所属迭代也没有可继承的时间");
        }
        return new GiteeApiService.GiteeTestPlanRequest(
                resolveTitle(testPlan.getName(), "未命名测试计划"),
                PLAN_REF_TYPE,
                projectBinding.getGiteeProgramId(),
                testPlanAssigneeId,
                defaultString(testPlan.getDescription()),
                formatRemoteDateTime(startDate, false),
                formatRemoteDateTime(endDate, true)
        );
    }

    /**
     * Gitee 推送优先使用测试计划自身时间，只有计划没配置时才继承所属迭代排期。
     */
    private LocalDate resolvePlannedStartDate(TestPlanEntity testPlan) {
        if (testPlan.getStartDate() != null) {
            return testPlan.getStartDate();
        }
        if (testPlan.getIteration() == null) {
            return null;
        }
        return testPlan.getIteration().getStartDate();
    }

    private LocalDate resolvePlannedEndDate(TestPlanEntity testPlan) {
        if (testPlan.getEndDate() != null) {
            return testPlan.getEndDate();
        }
        if (testPlan.getIteration() == null) {
            return null;
        }
        return testPlan.getIteration().getEndDate();
    }

    private GiteeApiService.GiteeTestCaseRequest buildTestCaseRequest(TestCaseEntity testCase, ProjectGiteeBindingEntity projectBinding) {
        List<GiteeApiService.GiteeTestCaseStepRequest> steps = buildStepRequests(testCase.getSteps());
        return new GiteeApiService.GiteeTestCaseRequest(
                testCaseModuleId,
                testCaseType,
                resolveTitle(testCase.getTitle(), "未命名测试用例"),
                defaultString(testCase.getPrecondition()),
                steps,
                defaultString(testCase.getRemarks()),
                List.of(),
                mapPriority(testCase.getPriority()),
                projectBinding.getGiteeProgramId()
        );
    }

    private List<GiteeApiService.GiteeTestCaseStepRequest> buildStepRequests(List<TestCaseStepEntity> steps) {
        List<TestCaseStepEntity> sortedSteps = steps.stream()
                .sorted((left, right) -> Integer.compare(defaultInt(left.getStepNo(), 0), defaultInt(right.getStepNo(), 0)))
                .toList();
        java.util.ArrayList<GiteeApiService.GiteeTestCaseStepRequest> result = new java.util.ArrayList<>();
        for (int index = 0; index < sortedSteps.size(); index += 1) {
            TestCaseStepEntity step = sortedSteps.get(index);
            int sort = index + 1;
            result.add(new GiteeApiService.GiteeTestCaseStepRequest(
                    sort,
                    sort,
                    defaultString(step.getAction()),
                    defaultString(step.getExpectedResult())
            ));
        }
        return result;
    }

    private void savePlanBinding(TestPlanGiteeBindingEntity existingBinding,
                                 TestPlanEntity testPlan,
                                 ProjectGiteeBindingEntity projectBinding,
                                 IterationGiteeBindingEntity iterationBinding,
                                 Long remoteTestPlanId,
                                 String executionStatus,
                                 String summaryMessage,
                                 LocalDateTime executedAt) {
        if (remoteTestPlanId == null && existingBinding == null) {
            return;
        }
        TestPlanGiteeBindingEntity entity = existingBinding == null ? new TestPlanGiteeBindingEntity() : existingBinding;
        entity.setTestPlan(testPlan);
        entity.setProject(testPlan.getProject());
        entity.setIteration(testPlan.getIteration());
        entity.setEnterpriseId(resolveEnterpriseId(projectBinding));
        entity.setGiteeProgramId(projectBinding.getGiteeProgramId());
        entity.setGiteeMilestoneId(iterationBinding.getGiteeMilestoneId());
        entity.setGiteeTestPlanId(remoteTestPlanId == null ? entity.getGiteeTestPlanId() : remoteTestPlanId);
        entity.setLastPushStatus(executionStatus);
        entity.setLastPushMessage(summaryMessage);
        entity.setLastPushedAt(executedAt);
        testPlanGiteeBindingRepository.save(entity);
    }

    private void fillCaseBinding(TestCaseGiteeBindingEntity entity,
                                 TestCaseEntity testCase,
                                 TestPlanEntity testPlan,
                                 ProjectGiteeBindingEntity projectBinding,
                                 IterationGiteeBindingEntity iterationBinding,
                                 Long remoteTestPlanId,
                                 Long remoteTestCaseId,
                                 LocalDateTime executedAt) {
        entity.setTestCase(testCase);
        entity.setTestPlan(testPlan);
        entity.setProject(testPlan.getProject());
        entity.setIteration(iterationBinding.getIteration());
        entity.setEnterpriseId(resolveEnterpriseId(projectBinding));
        entity.setGiteeProgramId(projectBinding.getGiteeProgramId());
        entity.setGiteeTestPlanId(remoteTestPlanId);
        entity.setGiteeTestCaseId(remoteTestCaseId);
        entity.setLastPushedAt(executedAt);
    }

    private String buildSummaryMessage(String testPlanAction, int createdCaseCount, int updatedCaseCount, int failedCaseCount) {
        String planActionLabel = ACTION_CREATED.equals(testPlanAction) ? "新增远端测试计划" : "更新远端测试计划";
        return planActionLabel
                + "，测试用例新增 " + createdCaseCount
                + "，更新 " + updatedCaseCount
                + "，失败 " + failedCaseCount;
    }

    private String formatRemoteDateTime(LocalDate date, boolean endOfDay) {
        LocalTime time = endOfDay ? LocalTime.of(23, 59, 59) : LocalTime.MIDNIGHT;
        return date.atTime(time).atZone(SHANGHAI_ZONE_ID).format(ISO_OFFSET_TIME_FORMATTER);
    }

    private int mapPriority(String priority) {
        String normalized = defaultString(priority).trim().toUpperCase(Locale.ROOT);
        return switch (normalized) {
            case "P0" -> 0;
            case "P1" -> 1;
            case "P3" -> 3;
            default -> 2;
        };
    }

    private int defaultInt(Integer value, int fallback) {
        return value == null ? fallback : value;
    }

    private String resolveTitle(String value, String fallback) {
        String normalized = trimToNull(value);
        return normalized == null ? fallback : normalized;
    }

    private String formatTime(LocalDateTime value) {
        return value == null ? null : value.format(TIME_FORMATTER);
    }

    private String limitMessage(String value) {
        if (!hasText(value)) {
            return "推送失败";
        }
        String normalized = value.trim();
        return normalized.length() > 1000 ? normalized.substring(0, 1000) : normalized;
    }

    private String defaultString(String value) {
        return value == null ? "" : value.trim();
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String normalized = value.trim();
        return normalized.isEmpty() ? null : normalized;
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }
}
