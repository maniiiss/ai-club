package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ProjectGitlabBindingEntity;
import com.aiclub.platform.domain.model.TestCaseEntity;
import com.aiclub.platform.domain.model.TestPlanEntity;
import com.aiclub.platform.dto.ExecutionTaskSummary;
import com.aiclub.platform.dto.TestPlanSummary;
import com.aiclub.platform.security.AuthContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 测试计划自动化入口服务。
 * 页面侧只关心“发起生成并验证”或“执行已接入自动化”，
 * 真正的脚本生成、执行与回写由执行中心专用场景承接。
 */
@Service
@Transactional(readOnly = true)
public class TestPlanAutomationService {

    public static final String MODE_GENERATE_AND_RUN = "GENERATE_AND_RUN";
    public static final String MODE_RUN_ONLY = "RUN_ONLY";

    private final TestPlanAutomationPersistenceService persistenceService;
    private final TestAutomationProfileService profileService;
    private final ExecutionTaskService executionTaskService;
    private final TestManagementService testManagementService;

    public TestPlanAutomationService(TestPlanAutomationPersistenceService persistenceService,
                                     TestAutomationProfileService profileService,
                                     ExecutionTaskService executionTaskService,
                                     TestManagementService testManagementService) {
        this.persistenceService = persistenceService;
        this.profileService = profileService;
        this.executionTaskService = executionTaskService;
        this.testManagementService = testManagementService;
    }

    @Transactional
    public ExecutionTaskSummary generateAndRun(Long planId) {
        return createAutomationTask(planId, MODE_GENERATE_AND_RUN);
    }

    @Transactional
    public ExecutionTaskSummary runExistingAutomation(Long planId) {
        return createAutomationTask(planId, MODE_RUN_ONLY);
    }

    public TestPlanSummary reloadPlan(Long planId) {
        return testManagementService.getTestPlan(planId);
    }

    private ExecutionTaskSummary createAutomationTask(Long planId, String mode) {
        TestPlanEntity plan = persistenceService.requireVisiblePlan(planId);
        ProjectGitlabBindingEntity binding = persistenceService.requireEnabledBinding(plan);
        TestAutomationProfileService.AutomationProfile profile = profileService.resolveProfile(binding);
        String targetBranch = resolveTargetBranch(plan, binding);
        List<Long> automatedCaseIds = plan.getCases().stream()
                .filter(this::isPlaywrightCase)
                .map(TestCaseEntity::getId)
                .toList();
        if (automatedCaseIds.isEmpty()) {
            throw new IllegalArgumentException("当前测试计划没有标记为 Playwright 的自动化用例");
        }
        Long currentUserId = AuthContextHolder.get()
                .map(authContext -> authContext.userId())
                .orElse(null);

        Map<String, Object> inputPayload = new LinkedHashMap<>();
        inputPayload.put("mode", mode);
        inputPayload.put("testPlanId", plan.getId());
        inputPayload.put("bindingId", binding.getId());
        inputPayload.put("targetBranch", targetBranch);
        inputPayload.put("automatedCaseIds", automatedCaseIds);
        inputPayload.put("repoKind", profile.repoKind());
        ExecutionTaskService.InternalCreateExecutionTaskCommand command =
                new ExecutionTaskService.InternalCreateExecutionTaskCommand(
                        ExecutionWorkflowService.SCENARIO_TEST_AUTOMATION,
                        plan.getProject().getId(),
                        null,
                        "测试计划自动化 · " + defaultString(plan.getName()).trim(),
                        "PAGE",
                        "TEST_PLAN_AUTOMATION",
                        plan.getId(),
                        currentUserId,
                        false,
                        List.of(),
                        inputPayload
                );
        var createdTask = executionTaskService.createInternalExecutionTask(command);
        persistenceService.markQueued(plan.getId(), createdTask.getId(), buildQueuedSummary(mode));
        return executionTaskService.getExecutionTaskSummary(createdTask.getId());
    }

    private boolean isPlaywrightCase(TestCaseEntity item) {
        if (item == null) {
            return false;
        }
        String normalized = defaultString(item.getAutomationType()).trim();
        return "PLAYWRIGHT".equalsIgnoreCase(normalized)
                || "自动化".equals(normalized)
                || "Playwright自动化".equalsIgnoreCase(normalized)
                || "Playwright 自动化".equalsIgnoreCase(normalized);
    }

    private String resolveTargetBranch(TestPlanEntity plan, ProjectGitlabBindingEntity binding) {
        String branch = defaultString(plan.getAutomationTargetBranch()).trim();
        if (!branch.isBlank()) {
            return branch;
        }
        branch = defaultString(binding.getDefaultTargetBranch()).trim();
        if (!branch.isBlank()) {
            return branch;
        }
        throw new IllegalArgumentException("当前测试计划未配置自动化目标分支，且仓库绑定也没有默认目标分支");
    }

    private String buildQueuedSummary(String mode) {
        if (MODE_RUN_ONLY.equalsIgnoreCase(mode)) {
            return "自动化执行任务已创建，等待开始验证现有脚本";
        }
        return "自动化生成与验证任务已创建，等待开始生成脚本";
    }

    private String defaultString(String value) {
        return value == null ? "" : value;
    }
}
