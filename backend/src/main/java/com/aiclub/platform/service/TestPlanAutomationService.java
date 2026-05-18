package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ProjectGitlabBindingEntity;
import com.aiclub.platform.domain.model.TestCaseEntity;
import com.aiclub.platform.domain.model.TestPlanEntity;
import com.aiclub.platform.dto.ExecutionTaskSummary;
import com.aiclub.platform.dto.TestPlanSummary;
import com.aiclub.platform.security.AuthContextHolder;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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

    private static final Logger log = LoggerFactory.getLogger(TestPlanAutomationService.class);

    public static final String MODE_GENERATE_AND_RUN = "GENERATE_AND_RUN";
    public static final String MODE_RUN_ONLY = "RUN_ONLY";

    private final TestPlanAutomationPersistenceService persistenceService;
    private final TestAutomationProfileService profileService;
    private final ExecutionTaskService executionTaskService;
    private final TestManagementService testManagementService;
    private final GitlabApiService gitlabApiService;
    private final TokenCipherService tokenCipherService;

    public TestPlanAutomationService(TestPlanAutomationPersistenceService persistenceService,
                                     TestAutomationProfileService profileService,
                                     ExecutionTaskService executionTaskService,
                                     TestManagementService testManagementService,
                                     GitlabApiService gitlabApiService,
                                     TokenCipherService tokenCipherService) {
        this.persistenceService = persistenceService;
        this.profileService = profileService;
        this.executionTaskService = executionTaskService;
        this.testManagementService = testManagementService;
        this.gitlabApiService = gitlabApiService;
        this.tokenCipherService = tokenCipherService;
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
        // 业务意图：RUN_ONLY 模式只跑仓库已有脚本，必须先用 GitLab API 校验目标分支上确实有
        // 平台模板路径下的 config 与本计划对应的 spec，避免任务排队后才在 code-processing 阶段失败。
        if (MODE_RUN_ONLY.equalsIgnoreCase(mode)) {
            verifyAutomationAssetsExist(plan, binding, targetBranch);
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

    /**
     * RUN_ONLY 模式只跑仓库已有 Playwright 资产，必须确认目标分支上至少存在
     * 平台模板路径下的 config 与本计划对应的 spec 文件，否则提前抛出业务异常，
     * 把错误挡在创建任务之前，让用户看得到原因，也避免空跑一个执行任务。
     */
    private void verifyAutomationAssetsExist(TestPlanEntity plan,
                                             ProjectGitlabBindingEntity binding,
                                             String targetBranch) {
        String token;
        try {
            token = tokenCipherService.decrypt(binding.getTokenCiphertext());
        } catch (RuntimeException exception) {
            log.warn("RUN_ONLY 校验时解密 GitLab token 失败: bindingId={}, message={}",
                    binding.getId(), exception.getMessage(), exception);
            throw new IllegalArgumentException("自动化仓库凭证无效或已失效，无法校验仓库脚本是否存在");
        }

        String configPath = TestAutomationScriptTemplateService.CONFIG_PATH;
        String specPath = TestAutomationScriptTemplateService.specPathFor(plan.getId());

        if (!gitLabFileExists(binding, token, targetBranch, configPath)) {
            throw new IllegalArgumentException(
                    "目标分支 " + targetBranch + " 尚未接入自动化脚本（缺少 " + configPath
                            + "），请先点击\"生成并验证自动化脚本\"由平台生成模板"
            );
        }
        if (!gitLabFileExists(binding, token, targetBranch, specPath)) {
            throw new IllegalArgumentException(
                    "目标分支 " + targetBranch + " 上尚未生成本计划对应的 spec（缺少 " + specPath
                            + "），请先点击\"生成并验证自动化脚本\"补齐脚本"
            );
        }
    }

    /**
     * GitLab 检查文件是否存在时，404 才算"不存在"；其他异常（401/403/网络）
     * 必须抛出来让用户自查 token 与权限，不能静默吞掉。
     */
    private boolean gitLabFileExists(ProjectGitlabBindingEntity binding,
                                     String token,
                                     String branch,
                                     String filePath) {
        try {
            return gitlabApiService.repositoryFileExists(
                    binding.getApiBaseUrl(),
                    token,
                    binding.getGitlabProjectRef(),
                    branch,
                    filePath
            );
        } catch (RuntimeException exception) {
            log.warn("RUN_ONLY 校验仓库文件失败: bindingId={}, branch={}, file={}, message={}",
                    binding.getId(), branch, filePath, exception.getMessage(), exception);
            throw new IllegalArgumentException(
                    "校验仓库脚本是否存在失败：" + (exception.getMessage() == null ? "请检查仓库连接和 token" : exception.getMessage())
            );
        }
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
