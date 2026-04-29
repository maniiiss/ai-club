package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ProjectGitlabBindingEntity;
import com.aiclub.platform.domain.model.TestCaseEntity;
import com.aiclub.platform.domain.model.TestPlanEntity;
import com.aiclub.platform.repository.TestCaseRepository;
import com.aiclub.platform.repository.ProjectGitlabBindingRepository;
import com.aiclub.platform.repository.TestPlanRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.NoSuchElementException;

/**
 * 统一维护测试计划自动化元数据，避免执行编排与页面入口各自直接改测试计划实体。
 */
@Service
public class TestPlanAutomationPersistenceService {

    private final TestPlanRepository testPlanRepository;
    private final TestCaseRepository testCaseRepository;
    private final ProjectGitlabBindingRepository projectGitlabBindingRepository;
    private final ProjectDataPermissionService projectDataPermissionService;

    public TestPlanAutomationPersistenceService(TestPlanRepository testPlanRepository,
                                                TestCaseRepository testCaseRepository,
                                                ProjectGitlabBindingRepository projectGitlabBindingRepository,
                                                ProjectDataPermissionService projectDataPermissionService) {
        this.testPlanRepository = testPlanRepository;
        this.testCaseRepository = testCaseRepository;
        this.projectGitlabBindingRepository = projectGitlabBindingRepository;
        this.projectDataPermissionService = projectDataPermissionService;
    }

    @Transactional(readOnly = true)
    public TestPlanEntity requireVisiblePlan(Long planId) {
        TestPlanEntity plan = requirePlanWithAutomationContext(planId);
        projectDataPermissionService.requireProjectVisible(plan.getProject());
        return plan;
    }

    @Transactional(readOnly = true)
    public TestPlanEntity requirePlan(Long planId) {
        return testPlanRepository.findById(planId)
                .orElseThrow(() -> new NoSuchElementException("测试计划不存在: " + planId));
    }

    @Transactional(readOnly = true)
    public TestPlanEntity requirePlanWithAutomationContext(Long planId) {
        return testPlanRepository.findAutomationContextById(planId)
                .orElseThrow(() -> new NoSuchElementException("测试计划不存在: " + planId));
    }

    @Transactional(readOnly = true)
    public List<TestCaseEntity> listCasesWithSteps(Long planId) {
        return testCaseRepository.findAutomationCasesWithStepsByTestPlanId(planId);
    }

    @Transactional(readOnly = true)
    public ProjectGitlabBindingEntity requireEnabledBinding(TestPlanEntity plan) {
        if (plan.getAutomationBinding() == null) {
            throw new IllegalArgumentException("当前测试计划尚未绑定自动化仓库");
        }
        ProjectGitlabBindingEntity binding = projectGitlabBindingRepository.findById(plan.getAutomationBinding().getId())
                .orElseThrow(() -> new NoSuchElementException("GitLab 绑定不存在: " + plan.getAutomationBinding().getId()));
        projectDataPermissionService.requireGitlabBindingVisible(binding);
        if (!binding.getProject().getId().equals(plan.getProject().getId())) {
            throw new IllegalArgumentException("自动化仓库必须属于当前测试计划所在项目");
        }
        if (!Boolean.TRUE.equals(binding.getEnabled())) {
            throw new IllegalArgumentException("当前测试计划绑定的自动化仓库已停用");
        }
        return binding;
    }

    @Transactional
    public void markQueued(Long planId, Long taskId, String summary) {
        TestPlanEntity plan = requirePlan(planId);
        plan.setLastAutomationTaskId(taskId);
        plan.setLastAutomationRunId(null);
        plan.setLastAutomationStatus("PENDING");
        plan.setLastAutomationSummary(limit(summary, 1000));
        plan.setLastAutomationAt(LocalDateTime.now());
        testPlanRepository.save(plan);
    }

    @Transactional
    public void markFinished(Long planId,
                             Long taskId,
                             Long runId,
                             String status,
                             String summary,
                             String mrUrl) {
        TestPlanEntity plan = requirePlan(planId);
        plan.setLastAutomationTaskId(taskId);
        plan.setLastAutomationRunId(runId);
        plan.setLastAutomationStatus(normalizeStatus(status));
        plan.setLastAutomationSummary(limit(summary, 1000));
        plan.setLastAutomationAt(LocalDateTime.now());
        if (hasText(mrUrl)) {
            plan.setLastAutomationMrUrl(limit(mrUrl, 500));
        }
        testPlanRepository.save(plan);
    }

    private String normalizeStatus(String value) {
        String normalized = defaultString(value).trim().toUpperCase();
        return switch (normalized) {
            case "SUCCESS", "FAILED", "PENDING", "IDLE" -> normalized;
            default -> "FAILED";
        };
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private String defaultString(String value) {
        return value == null ? "" : value;
    }

    private String limit(String value, int maxLength) {
        String normalized = defaultString(value).trim();
        if (normalized.length() <= maxLength) {
            return normalized;
        }
        return normalized.substring(0, maxLength);
    }
}
