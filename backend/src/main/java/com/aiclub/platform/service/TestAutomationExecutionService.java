package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ExecutionArtifactEntity;
import com.aiclub.platform.domain.model.ExecutionRunEntity;
import com.aiclub.platform.domain.model.ExecutionStepEntity;
import com.aiclub.platform.domain.model.ExecutionTaskEntity;
import com.aiclub.platform.domain.model.ProjectGitlabBindingEntity;
import com.aiclub.platform.domain.model.TestCaseEntity;
import com.aiclub.platform.domain.model.TestPlanEntity;
import com.aiclub.platform.repository.ExecutionArtifactRepository;
import com.aiclub.platform.repository.ExecutionRunRepository;
import com.aiclub.platform.repository.ExecutionStepRepository;
import com.aiclub.platform.repository.ExecutionTaskRepository;
import com.aiclub.platform.repository.ProjectGitlabBindingRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

/**
 * 测试计划自动化执行编排器。
 * V1 走“平台模板生成脚本 + GitLab API 提交资产 + code-processing 执行仓库 Playwright”模式，
 * 不额外引入新的智能体 MCP 控制面。
 */
@Service
public class TestAutomationExecutionService {

    private static final String MODE_GENERATE_AND_RUN = TestPlanAutomationService.MODE_GENERATE_AND_RUN;
    private static final String MODE_RUN_ONLY = TestPlanAutomationService.MODE_RUN_ONLY;
    private static final String PLAN_ARTIFACT_TYPE = "AUTOMATION_PLAN_MARKDOWN";
    private static final String PLAN_ARTIFACT_TITLE = "自动化规划 Markdown";
    private static final String SCRIPT_MANIFEST_ARTIFACT_TYPE = "AUTOMATION_SCRIPT_MANIFEST_JSON";
    private static final String SCRIPT_MANIFEST_ARTIFACT_TITLE = "自动化脚本清单";
    private static final String SCRIPT_PREVIEW_ARTIFACT_TYPE = "AUTOMATION_SCRIPT_PREVIEW_MARKDOWN";
    private static final String TEST_PLAN_ARTIFACT_TYPE = "AUTOMATION_TEST_PLAN_JSON";
    private static final String TEST_PLAN_ARTIFACT_TITLE = "自动化测试计划 JSON";
    private static final String TEST_RESULT_ARTIFACT_TYPE = "AUTOMATION_TEST_RESULT_JSON";
    private static final String TEST_RESULT_MARKDOWN_ARTIFACT_TYPE = "AUTOMATION_TEST_RESULT_MARKDOWN";
    private static final String REPORT_ARTIFACT_TYPE = "AUTOMATION_REPORT_MARKDOWN";
    private static final String REPORT_ARTIFACT_TITLE = "自动化执行报告";

    private final ExecutionStepRepository executionStepRepository;
    private final ExecutionRunRepository executionRunRepository;
    private final ExecutionTaskRepository executionTaskRepository;
    private final ExecutionArtifactRepository executionArtifactRepository;
    private final ExecutionEventService executionEventService;
    private final ExecutionAsyncSessionService executionAsyncSessionService;
    private final TestPlanAutomationPersistenceService automationPersistenceService;
    private final ProjectGitlabBindingRepository projectGitlabBindingRepository;
    private final TestAutomationProfileService profileService;
    private final TestAutomationScriptTemplateService templateService;
    private final GitlabApiService gitlabApiService;
    private final TokenCipherService tokenCipherService;
    private final CodeProcessingCliExecutionClientService cliExecutionClientService;
    private final ObjectMapper objectMapper;

    public TestAutomationExecutionService(ExecutionStepRepository executionStepRepository,
                                          ExecutionRunRepository executionRunRepository,
                                          ExecutionTaskRepository executionTaskRepository,
                                          ExecutionArtifactRepository executionArtifactRepository,
                                          ExecutionEventService executionEventService,
                                          ExecutionAsyncSessionService executionAsyncSessionService,
                                          TestPlanAutomationPersistenceService automationPersistenceService,
                                          ProjectGitlabBindingRepository projectGitlabBindingRepository,
                                          TestAutomationProfileService profileService,
                                          TestAutomationScriptTemplateService templateService,
                                          GitlabApiService gitlabApiService,
                                          TokenCipherService tokenCipherService,
                                          CodeProcessingCliExecutionClientService cliExecutionClientService,
                                          ObjectMapper objectMapper) {
        this.executionStepRepository = executionStepRepository;
        this.executionRunRepository = executionRunRepository;
        this.executionTaskRepository = executionTaskRepository;
        this.executionArtifactRepository = executionArtifactRepository;
        this.executionEventService = executionEventService;
        this.executionAsyncSessionService = executionAsyncSessionService;
        this.automationPersistenceService = automationPersistenceService;
        this.projectGitlabBindingRepository = projectGitlabBindingRepository;
        this.profileService = profileService;
        this.templateService = templateService;
        this.gitlabApiService = gitlabApiService;
        this.tokenCipherService = tokenCipherService;
        this.cliExecutionClientService = cliExecutionClientService;
        this.objectMapper = objectMapper;
    }

    public TestAutomationExecutionResult executeAutomationTask(ExecutionTaskEntity executionTask,
                                                               ExecutionRunEntity executionRun,
                                                               ExecutionWorkflowService.WorkflowPlan workflowPlan) {
        AutomationTaskPayload payload = readPayload(executionTask.getInputPayload());
        TestPlanEntity plan = automationPersistenceService.requirePlanWithAutomationContext(payload.testPlanId());
        List<TestCaseEntity> casesWithSteps = automationPersistenceService.listCasesWithSteps(payload.testPlanId());
        ProjectGitlabBindingEntity binding = requireBinding(payload.bindingId(), plan);
        TestAutomationProfileService.AutomationProfile profile = profileService.resolveProfile(binding);
        List<TestCaseEntity> automatedCases = casesWithSteps.stream()
                .filter(this::isPlaywrightCase)
                .toList();
        if (automatedCases.isEmpty()) {
            throw new IllegalArgumentException("当前测试计划没有可自动化的 Playwright 用例");
        }

        List<ExecutionArtifactEntity> artifacts = new ArrayList<>();
        String planSlug = "test-plan-" + plan.getId();
        String generatedBranch = buildGeneratedBranch(plan.getId(), executionRun.getId());
        String mergeRequestUrl = null;
        FailureContext failureContext = null;
        String reportSummary = "";
        JsonNode testResultPayload = objectMapper.createObjectNode();
        int totalSteps = Math.max(workflowPlan.steps().size(), 1);

        ExecutionWorkflowService.ExecutionStepPlan planStep = workflowPlan.steps().get(0);
        String planMarkdown = buildAutomationPlanMarkdown(plan, binding, profile, payload.mode(), payload.targetBranch(), automatedCases);
        ExecutionStepEntity createdPlanStep = beginStep(executionTask, executionRun, planStep, totalSteps, "生成自动化规划摘要");
        completeStep(executionTask, executionRun, planStep, totalSteps, createdPlanStep, planMarkdown, "自动化规划已生成");
        artifacts.add(saveArtifact(executionTask, executionRun, createdPlanStep, PLAN_ARTIFACT_TYPE, PLAN_ARTIFACT_TITLE, planMarkdown));

        TestAutomationScriptTemplateService.GeneratedScriptBundle scriptBundle = templateService.generate(
                plan,
                binding,
                profile,
                payload.targetBranch(),
                generatedBranch,
                automatedCases
        );

        ExecutionWorkflowService.ExecutionStepPlan implementStep = workflowPlan.steps().get(1);
        ExecutionStepEntity createdImplementStep = beginStep(executionTask, executionRun, implementStep, totalSteps, "生成并提交 Playwright 自动化脚本");
        try {
            if (MODE_RUN_ONLY.equalsIgnoreCase(payload.mode())) {
                String skipMessage = "当前任务复用仓库中已接入的自动化脚本，跳过脚本生成与 MR 创建";
                markSkipped(executionTask, executionRun, createdImplementStep, totalSteps, skipMessage);
            } else {
                ImplementResult implementResult = commitGeneratedScripts(plan, binding, payload, scriptBundle, generatedBranch);
                mergeRequestUrl = implementResult.mergeRequestUrl();
                completeStep(executionTask, executionRun, implementStep, totalSteps, createdImplementStep, implementResult.markdown(), "自动化脚本已提交并创建 MR");
                artifacts.add(saveArtifact(executionTask, executionRun, createdImplementStep, SCRIPT_MANIFEST_ARTIFACT_TYPE, SCRIPT_MANIFEST_ARTIFACT_TITLE, scriptBundle.files().get(scriptBundle.manifestPath())));
                artifacts.add(saveArtifact(executionTask, executionRun, createdImplementStep, SCRIPT_PREVIEW_ARTIFACT_TYPE, "自动化脚本预览", implementResult.markdown()));
            }
        } catch (RuntimeException exception) {
            failureContext = markFailure(executionTask, executionRun, createdImplementStep, totalSteps, exception);
        }

        ExecutionWorkflowService.ExecutionStepPlan testStep = workflowPlan.steps().get(2);
        ExecutionStepEntity createdTestStep = beginStep(executionTask, executionRun, testStep, totalSteps, "执行仓库内 Playwright 自动化脚本");
        if (failureContext != null) {
            markSkipped(executionTask, executionRun, createdTestStep, totalSteps, "前置脚本生成失败，已跳过自动化执行");
        } else {
            try {
                TestExecutionResult testResult = executePlaywrightRepoSuite(
                        executionTask,
                        executionRun,
                        createdTestStep,
                        totalSteps,
                        binding,
                        profile,
                        payload.targetBranch(),
                        MODE_GENERATE_AND_RUN.equalsIgnoreCase(payload.mode()) ? generatedBranch : payload.targetBranch(),
                        planSlug,
                        scriptBundle
                );
                testResultPayload = testResult.rawPayload();
                artifacts.add(saveArtifact(executionTask, executionRun, createdTestStep, TEST_PLAN_ARTIFACT_TYPE, TEST_PLAN_ARTIFACT_TITLE, testResult.testPlanJson()));
                artifacts.add(saveArtifact(executionTask, executionRun, createdTestStep, TEST_RESULT_ARTIFACT_TYPE, "自动化测试结果 JSON", prettyJson(testResult.rawPayload())));
                artifacts.add(saveArtifact(executionTask, executionRun, createdTestStep, TEST_RESULT_MARKDOWN_ARTIFACT_TYPE, "自动化测试结果 Markdown", testResult.markdown()));
                if (!"SUCCESS".equalsIgnoreCase(testResult.status())) {
                    failureContext = markFailure(executionTask, executionRun, createdTestStep, totalSteps, new IllegalStateException(testResult.summary()));
                }
            } catch (RuntimeException exception) {
                failureContext = markFailure(executionTask, executionRun, createdTestStep, totalSteps, exception);
            }
        }

        ExecutionWorkflowService.ExecutionStepPlan reportStep = workflowPlan.steps().get(3);
        ExecutionStepEntity createdReportStep = beginStep(executionTask, executionRun, reportStep, totalSteps, "汇总自动化结果并回写测试计划");
        try {
            String reportMarkdown = buildReportMarkdown(plan, payload.mode(), payload.targetBranch(), generatedBranch, mergeRequestUrl, testResultPayload, failureContext);
            reportSummary = extractReportSummary(reportMarkdown);
            completeStep(executionTask, executionRun, reportStep, totalSteps, createdReportStep, reportMarkdown, "自动化执行报告已生成");
            artifacts.add(saveArtifact(executionTask, executionRun, createdReportStep, REPORT_ARTIFACT_TYPE, REPORT_ARTIFACT_TITLE, reportMarkdown));
        } catch (RuntimeException exception) {
            failureContext = markFailure(executionTask, executionRun, createdReportStep, totalSteps, exception);
            reportSummary = resolveMessage(exception, "自动化执行报告生成失败");
        }

        executionRun.setOutputSummary(reportSummary);
        executionRun.setUpdatedAt(LocalDateTime.now());
        executionRunRepository.save(executionRun);

        if (failureContext != null) {
            automationPersistenceService.markFinished(plan.getId(), executionTask.getId(), executionRun.getId(), "FAILED", reportSummary, mergeRequestUrl);
            throw new TestAutomationExecutionStepException(failureContext.failedStep(), failureContext.exception(), artifacts, reportSummary);
        }
        automationPersistenceService.markFinished(plan.getId(), executionTask.getId(), executionRun.getId(), "SUCCESS", reportSummary, mergeRequestUrl);
        return new TestAutomationExecutionResult(reportSummary, artifacts, false);
    }

    private ImplementResult commitGeneratedScripts(TestPlanEntity plan,
                                                   ProjectGitlabBindingEntity binding,
                                                   AutomationTaskPayload payload,
                                                   TestAutomationScriptTemplateService.GeneratedScriptBundle scriptBundle,
                                                   String generatedBranch) {
        String token = tokenCipherService.decrypt(binding.getTokenCiphertext());
        gitlabApiService.createBranch(binding.getApiBaseUrl(), token, binding.getGitlabProjectRef(), generatedBranch, payload.targetBranch());
        List<GitlabApiService.GitlabCommitAction> actions = new ArrayList<>();
        for (Map.Entry<String, String> item : scriptBundle.files().entrySet()) {
            String action = gitlabApiService.repositoryFileExists(
                    binding.getApiBaseUrl(),
                    token,
                    binding.getGitlabProjectRef(),
                    generatedBranch,
                    item.getKey()
            ) ? "update" : "create";
            actions.add(new GitlabApiService.GitlabCommitAction(action, item.getKey(), item.getValue()));
        }
        GitlabApiService.GitlabCreatedCommit commit = gitlabApiService.createCommit(
                binding.getApiBaseUrl(),
                token,
                binding.getGitlabProjectRef(),
                generatedBranch,
                "test: add automation for plan #" + plan.getId(),
                actions
        );
        GitlabApiService.GitlabCreatedMergeRequest mergeRequest = gitlabApiService.createMergeRequest(
                binding.getApiBaseUrl(),
                token,
                binding.getGitlabProjectRef(),
                generatedBranch,
                payload.targetBranch(),
                "test: add automation for " + defaultString(plan.getName()).trim(),
                buildMergeRequestDescription(plan, scriptBundle)
        );
        return new ImplementResult(
                buildImplementMarkdown(plan, binding, payload.targetBranch(), generatedBranch, commit, mergeRequest, scriptBundle),
                mergeRequest.webUrl()
        );
    }

    private TestExecutionResult executePlaywrightRepoSuite(ExecutionTaskEntity executionTask,
                                                           ExecutionRunEntity executionRun,
                                                           ExecutionStepEntity step,
                                                           int totalSteps,
                                                           ProjectGitlabBindingEntity binding,
                                                           TestAutomationProfileService.AutomationProfile profile,
                                                           String targetBranch,
                                                           String executionBranch,
                                                           String planSlug,
                                                           TestAutomationScriptTemplateService.GeneratedScriptBundle scriptBundle) {
        Map<String, Object> testPlanPayload = buildRepoSuitePayload(profile, planSlug, scriptBundle);
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("runnerType", "CODEX_CLI");
        payload.put("mode", "TEST");
        payload.put("systemPrompt", "");
        payload.put("input", "执行测试计划自动化脚本");
        payload.put("repositories", List.of(buildRepositoryPayload(binding, executionBranch)));
        payload.put("execution", buildExecutionPayload(executionTask, executionRun, step));
        payload.put("testPlan", testPlanPayload);
        payload.put("timeoutSeconds", executionAsyncSessionService.maxRuntimeSeconds(step.getStepCode()));

        CodeProcessingCliExecutionClientService.ExecutionSessionAcceptedResponse startResult = cliExecutionClientService.startExecution(payload);
        executionAsyncSessionService.bindRunnerSession(executionTask, executionRun, step, startResult.sessionId(), startResult.runnerType());
        ExecutionStepEntity completedStep = executionAsyncSessionService.awaitTerminalStep(step.getId(), executionAsyncSessionService.maxRuntimeSeconds(step.getStepCode()));
        if ("CANCELED".equalsIgnoreCase(completedStep.getStatus())) {
            throw new IllegalStateException("自动化执行已取消");
        }
        TestExecutionResult result = parseTestExecutionResult(defaultString(completedStep.getOutputSnapshot()), prettyJson(testPlanPayload));
        completedStep.setLatestMessage(limit(result.summary(), 1000));
        executionStepRepository.save(completedStep);

        executionRun.setProgressPercent(step.getStepNo() * 100 / totalSteps);
        executionRun.setOutputSummary(limit(result.summary(), 4000));
        executionRun.setUpdatedAt(LocalDateTime.now());
        executionRunRepository.save(executionRun);

        executionTask.setLatestSummary(limit(result.summary(), 1000));
        executionTaskRepository.save(executionTask);
        executionEventService.recordSummary(executionTask, executionRun, completedStep, result.summary());
        return result;
    }

    private Map<String, Object> buildRepoSuitePayload(TestAutomationProfileService.AutomationProfile profile,
                                                      String planSlug,
                                                      TestAutomationScriptTemplateService.GeneratedScriptBundle scriptBundle) {
        Map<String, Object> suite = new LinkedHashMap<>();
        suite.put("suiteId", "playwright-repo-suite");
        suite.put("type", "PLAYWRIGHT_REPO_SUITE");
        suite.put("status", "PENDING");
        suite.put("summary", "等待执行仓库 Playwright 自动化脚本");
        suite.put("workingDir", defaultString(profile.workingDir()).trim());
        suite.put("packageManager", defaultString(profile.packageManager()).trim());
        suite.put("startCommand", defaultString(profile.startCommand()).trim());
        suite.put("baseUrl", defaultString(profile.baseUrl()).trim());
        suite.put("readySelector", profileService.resolveReadySelector(profile));
        suite.put("configPath", scriptBundle.configPath());
        suite.put("specPaths", List.of(scriptBundle.specPath()));
        suite.put("planSlug", planSlug);
        return Map.of("suites", List.of(suite));
    }

    private Map<String, Object> buildRepositoryPayload(ProjectGitlabBindingEntity binding, String branch) {
        return Map.of(
                "bindingId", String.valueOf(binding.getId()),
                "displayName", resolveBindingDisplayName(binding),
                "projectRef", defaultString(binding.getGitlabProjectRef()),
                "projectPath", defaultString(binding.getGitlabProjectPath()),
                "repoUrl", defaultString(resolveCloneUrl(binding)),
                "targetBranch", defaultString(branch),
                "apiBaseUrl", defaultString(binding.getApiBaseUrl()),
                "authToken", tokenCipherService.decrypt(binding.getTokenCiphertext())
        );
    }

    private Map<String, Object> buildExecutionPayload(ExecutionTaskEntity executionTask,
                                                      ExecutionRunEntity executionRun,
                                                      ExecutionStepEntity step) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("taskId", String.valueOf(executionTask.getId()));
        payload.put("runId", String.valueOf(executionRun.getId()));
        payload.put("stepId", String.valueOf(step.getId()));
        payload.put("stepCode", defaultString(step.getStepCode()));
        payload.put("stepName", defaultString(step.getStepName()));
        payload.put("projectId", String.valueOf(executionTask.getProject().getId()));
        payload.put("projectName", defaultString(executionTask.getProject().getName()));
        payload.put("sessionKey", "execution:" + executionTask.getId() + ":run:" + executionRun.getId());
        payload.put("userId", executionTask.getCreatedByUser() == null ? "" : String.valueOf(executionTask.getCreatedByUser().getId()));
        payload.put("userName", executionTask.getCreatedByUser() == null ? "" : defaultString(executionTask.getCreatedByUser().getNickname()).trim());
        return payload;
    }

    private String buildAutomationPlanMarkdown(TestPlanEntity plan,
                                               ProjectGitlabBindingEntity binding,
                                               TestAutomationProfileService.AutomationProfile profile,
                                               String mode,
                                               String targetBranch,
                                               List<TestCaseEntity> automatedCases) {
        StringBuilder builder = new StringBuilder();
        builder.append("# 自动化规划\n\n")
                .append("- 测试计划：").append(defaultString(plan.getName()).trim()).append('\n')
                .append("- 仓库：").append(resolveBindingDisplayName(binding)).append('\n')
                .append("- 目标分支：").append(targetBranch).append('\n')
                .append("- 执行模式：").append(MODE_RUN_ONLY.equalsIgnoreCase(mode) ? "只执行现有脚本" : "生成并验证自动化脚本").append('\n')
                .append("- 工作目录：").append(defaultString(profile.workingDir()).trim().isBlank() ? "仓库根目录" : profile.workingDir().trim()).append('\n')
                .append("- 启动命令：").append(defaultString(profile.startCommand()).trim().isBlank() ? "按仓库 package.json 自动推断" : profile.startCommand().trim()).append('\n')
                .append("- 默认页面：").append(profileService.resolveDefaultPath(profile)).append('\n')
                .append("- Ready Selector：").append(profileService.resolveReadySelector(profile)).append("\n\n")
                .append("## 纳入自动化的测试用例\n\n");
        for (TestCaseEntity item : automatedCases) {
            builder.append("- [#").append(item.getId()).append("] ")
                    .append(defaultString(item.getTitle()).trim())
                    .append(" / 模块：").append(defaultString(item.getModuleName()).trim().isBlank() ? "-" : item.getModuleName().trim());
            if (!defaultString(item.getAutomationHint()).trim().isBlank()) {
                builder.append(" / 提示：").append(item.getAutomationHint().trim());
            }
            builder.append('\n');
        }
        return builder.toString().trim();
    }

    private String buildImplementMarkdown(TestPlanEntity plan,
                                          ProjectGitlabBindingEntity binding,
                                          String targetBranch,
                                          String generatedBranch,
                                          GitlabApiService.GitlabCreatedCommit commit,
                                          GitlabApiService.GitlabCreatedMergeRequest mergeRequest,
                                          TestAutomationScriptTemplateService.GeneratedScriptBundle scriptBundle) {
        return """
                # 自动化脚本生成结果

                - 测试计划：%s
                - 仓库：%s
                - 目标分支：%s
                - 生成分支：%s
                - Commit：%s
                - Merge Request：%s

                ## 生成文件

                - %s
                - %s
                - %s

                ## 说明

                - 本次采用平台模板生成 Playwright 自动化资产。
                - 后续如宿主环境接入 Playwright MCP，可在失败修复阶段增强页面理解与定位能力。
                """.formatted(
                defaultString(plan.getName()).trim(),
                resolveBindingDisplayName(binding),
                targetBranch,
                generatedBranch,
                defaultString(commit.shortId()).trim(),
                defaultString(mergeRequest.webUrl()).trim(),
                scriptBundle.configPath(),
                scriptBundle.specPath(),
                scriptBundle.manifestPath()
        ).trim();
    }

    private String buildMergeRequestDescription(TestPlanEntity plan,
                                                TestAutomationScriptTemplateService.GeneratedScriptBundle scriptBundle) {
        return """
                自动生成测试计划自动化脚本。

                - 测试计划：%s
                - 计划ID：%s
                - 自动化用例数：%s
                - 生成目录：.ai-club/automation/playwright
                """.formatted(
                defaultString(plan.getName()).trim(),
                plan.getId(),
                scriptBundle.automatedCaseCount()
        ).trim();
    }

    private String buildReportMarkdown(TestPlanEntity plan,
                                       String mode,
                                       String targetBranch,
                                       String generatedBranch,
                                       String mergeRequestUrl,
                                       JsonNode testResultPayload,
                                       FailureContext failureContext) {
        String testStatus = defaultString(testResultPayload.path("status").asText("SUCCESS")).trim();
        String testSummary = defaultString(testResultPayload.path("summary").asText("未执行自动化测试")).trim();
        StringBuilder builder = new StringBuilder();
        builder.append("# 自动化执行报告\n\n")
                .append("- 测试计划：").append(defaultString(plan.getName()).trim()).append('\n')
                .append("- 执行模式：").append(MODE_RUN_ONLY.equalsIgnoreCase(mode) ? "只执行现有脚本" : "生成并验证自动化脚本").append('\n')
                .append("- 目标分支：").append(defaultString(targetBranch).trim()).append('\n');
        if (MODE_GENERATE_AND_RUN.equalsIgnoreCase(mode)) {
            builder.append("- 生成分支：").append(defaultString(generatedBranch).trim()).append('\n');
        }
        if (hasText(mergeRequestUrl)) {
            builder.append("- Merge Request：").append(mergeRequestUrl.trim()).append('\n');
        }
        builder.append("- 测试结果：").append(testStatus).append('\n')
                .append("- 结果摘要：").append(testSummary).append("\n\n");

        if (failureContext != null) {
            builder.append("## 失败原因\n\n")
                    .append("- 失败步骤：").append(defaultString(failureContext.failedStep().getStepName()).trim()).append('\n')
                    .append("- 原因：").append(resolveMessage(failureContext.exception(), "自动化执行失败")).append("\n\n");
        }

        if (testResultPayload.path("suiteResults").isArray()) {
            builder.append("## Suite 结果\n\n");
            for (JsonNode suite : testResultPayload.path("suiteResults")) {
                builder.append("- ")
                        .append(defaultString(suite.path("type").asText("SUITE")).trim())
                        .append(" / ")
                        .append(defaultString(suite.path("status").asText("UNKNOWN")).trim())
                        .append(" / ")
                        .append(defaultString(suite.path("summary").asText("")).trim())
                        .append('\n');
            }
            builder.append('\n');
        }
        return builder.toString().trim();
    }

    private String extractReportSummary(String reportMarkdown) {
        for (String line : defaultString(reportMarkdown).split("\\R")) {
            String normalized = line.trim();
            if (normalized.isEmpty() || normalized.startsWith("#") || normalized.startsWith("-")) {
                continue;
            }
            return normalized;
        }
        return "自动化执行已完成";
    }

    private TestExecutionResult parseTestExecutionResult(String rawOutput, String testPlanJson) {
        try {
            JsonNode payload = objectMapper.readTree(defaultString(rawOutput));
            return new TestExecutionResult(
                    defaultString(payload.path("status").asText("FAILED")).trim().toUpperCase(),
                    defaultString(payload.path("summary").asText("自动化执行失败")).trim(),
                    payload,
                    testPlanJson,
                    buildTestResultMarkdown(payload)
            );
        } catch (Exception exception) {
            String summary = "自动化执行结果解析失败";
            return new TestExecutionResult(
                    "FAILED",
                    summary,
                    objectMapper.createObjectNode().put("status", "FAILED").put("summary", summary).put("rawOutput", defaultString(rawOutput)),
                    testPlanJson,
                    """
                    # 自动化测试结果

                    - 状态：FAILED
                    - 摘要：自动化执行结果解析失败
                    """.trim()
            );
        }
    }

    private String buildTestResultMarkdown(JsonNode payload) {
        StringBuilder builder = new StringBuilder();
        builder.append("# 自动化测试结果\n\n")
                .append("- 状态：").append(defaultString(payload.path("status").asText("FAILED")).trim()).append('\n')
                .append("- 摘要：").append(defaultString(payload.path("summary").asText("")).trim()).append("\n\n");
        if (payload.path("suiteResults").isArray()) {
            builder.append("## Suite 结果\n\n");
            for (JsonNode suite : payload.path("suiteResults")) {
                builder.append("### ")
                        .append(defaultString(suite.path("type").asText("SUITE")).trim())
                        .append('\n')
                        .append("- 状态：").append(defaultString(suite.path("status").asText("")).trim()).append('\n')
                        .append("- 摘要：").append(defaultString(suite.path("summary").asText("")).trim()).append('\n');
                if (suite.path("artifacts").isArray()) {
                    builder.append("- 产物数：").append(suite.path("artifacts").size()).append('\n');
                }
                builder.append('\n');
            }
        }
        return builder.toString().trim();
    }

    private ExecutionStepEntity beginStep(ExecutionTaskEntity executionTask,
                                          ExecutionRunEntity executionRun,
                                          ExecutionWorkflowService.ExecutionStepPlan stepPlan,
                                          int totalSteps,
                                          String input) {
        ExecutionStepEntity step = new ExecutionStepEntity();
        step.setRun(executionRun);
        step.setStepNo(stepPlan.stepNo());
        step.setStepCode(stepPlan.stepCode());
        step.setStepName(stepPlan.stepName());
        step.setStatus("RUNNING");
        step.setProgressPercent(0);
        step.setLatestMessage("执行中");
        step.setStartedAt(LocalDateTime.now());
        step.setInputSnapshot(defaultString(input));
        step = executionStepRepository.save(step);

        executionRun.setStatus("RUNNING");
        executionRun.setCurrentStepNo(stepPlan.stepNo());
        executionRun.setProgressPercent(Math.max((stepPlan.stepNo() - 1) * 100 / totalSteps, 0));
        executionRun.setUpdatedAt(LocalDateTime.now());
        executionRunRepository.save(executionRun);

        executionTask.setLatestSummary("执行中：" + stepPlan.stepName());
        executionTaskRepository.save(executionTask);
        executionEventService.recordStepStarted(executionTask, executionRun, step, "执行中：" + stepPlan.stepName());
        return step;
    }

    private void completeStep(ExecutionTaskEntity executionTask,
                              ExecutionRunEntity executionRun,
                              ExecutionWorkflowService.ExecutionStepPlan stepPlan,
                              int totalSteps,
                              ExecutionStepEntity step,
                              String output,
                              String summary) {
        step.setStatus("SUCCESS");
        step.setOutputSnapshot(defaultString(output));
        step.setLatestMessage(limit(summary, 1000));
        step.setProgressPercent(100);
        step.setFinishedAt(LocalDateTime.now());
        executionStepRepository.save(step);

        executionRun.setProgressPercent(stepPlan.stepNo() * 100 / totalSteps);
        executionRun.setOutputSummary(limit(summary, 4000));
        executionRun.setUpdatedAt(LocalDateTime.now());
        executionRunRepository.save(executionRun);

        executionTask.setLatestSummary(limit(summary, 1000));
        executionTaskRepository.save(executionTask);
        executionEventService.recordSummary(executionTask, executionRun, step, summary);
        executionEventService.recordStepFinished(executionTask, executionRun, step, summary);
    }

    private void markSkipped(ExecutionTaskEntity executionTask,
                             ExecutionRunEntity executionRun,
                             ExecutionStepEntity step,
                             int totalSteps,
                             String summary) {
        step.setStatus("SKIPPED");
        step.setLatestMessage(limit(summary, 1000));
        step.setProgressPercent(100);
        step.setFinishedAt(LocalDateTime.now());
        executionStepRepository.save(step);

        executionRun.setProgressPercent(step.getStepNo() * 100 / totalSteps);
        executionRun.setUpdatedAt(LocalDateTime.now());
        executionRunRepository.save(executionRun);
        executionEventService.recordSummary(executionTask, executionRun, step, summary);
        executionEventService.recordStepFinished(executionTask, executionRun, step, summary);
    }

    private FailureContext markFailure(ExecutionTaskEntity executionTask,
                                       ExecutionRunEntity executionRun,
                                       ExecutionStepEntity step,
                                       int totalSteps,
                                       RuntimeException exception) {
        String message = resolveMessage(exception, "自动化执行失败");
        step.setStatus("FAILED");
        step.setLatestMessage(limit(message, 1000));
        step.setErrorMessage(limit(message, 4000));
        step.setProgressPercent(Math.max(step.getProgressPercent(), 1));
        step.setFinishedAt(LocalDateTime.now());
        executionStepRepository.save(step);

        executionRun.setProgressPercent(Math.max((step.getStepNo() - 1) * 100 / totalSteps, executionRun.getProgressPercent()));
        executionRun.setErrorMessage(limit(message, 4000));
        executionRun.setUpdatedAt(LocalDateTime.now());
        executionRunRepository.save(executionRun);

        executionTask.setLatestSummary(limit(message, 1000));
        executionTaskRepository.save(executionTask);
        executionEventService.recordSummary(executionTask, executionRun, step, message);
        executionEventService.recordStepFinished(executionTask, executionRun, step, message);
        return new FailureContext(step, exception);
    }

    private ExecutionArtifactEntity saveArtifact(ExecutionTaskEntity executionTask,
                                                 ExecutionRunEntity executionRun,
                                                 ExecutionStepEntity step,
                                                 String artifactType,
                                                 String title,
                                                 String contentText) {
        ExecutionArtifactEntity artifact = new ExecutionArtifactEntity();
        artifact.setRun(executionRun);
        artifact.setStep(step);
        artifact.setArtifactType(artifactType);
        artifact.setTitle(title);
        artifact.setContentText(contentText);
        artifact.setWorkItemWritebackFlag(false);
        ExecutionArtifactEntity saved = executionArtifactRepository.save(artifact);
        executionEventService.recordArtifactReady(executionTask, executionRun, step, saved.getId(), saved.getTitle());
        return saved;
    }

    private AutomationTaskPayload readPayload(String inputPayload) {
        try {
            JsonNode root = objectMapper.readTree(defaultString(inputPayload));
            return new AutomationTaskPayload(
                    root.path("mode").asText(MODE_GENERATE_AND_RUN),
                    root.path("testPlanId").asLong(),
                    root.path("bindingId").asLong(),
                    root.path("targetBranch").asText("")
            );
        } catch (Exception exception) {
            throw new IllegalArgumentException("自动化执行任务载荷不是合法 JSON", exception);
        }
    }

    private ProjectGitlabBindingEntity requireBinding(Long bindingId, TestPlanEntity plan) {
        ProjectGitlabBindingEntity binding = projectGitlabBindingRepository.findById(bindingId)
                .orElseThrow(() -> new NoSuchElementException("GitLab 绑定不存在: " + bindingId));
        if (!binding.getProject().getId().equals(plan.getProject().getId())) {
            throw new IllegalArgumentException("自动化仓库必须属于当前测试计划所在项目");
        }
        return binding;
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

    private String buildGeneratedBranch(Long planId, Long runId) {
        return "ai-club/test-automation/plan-" + planId + "-run-" + runId;
    }

    private String resolveCloneUrl(ProjectGitlabBindingEntity binding) {
        if (hasText(binding.getGitlabHttpCloneUrl())) {
            return binding.getGitlabHttpCloneUrl().trim();
        }
        throw new IllegalArgumentException("当前 GitLab 绑定尚未回写 HTTP Clone 地址，请先测试仓库连接");
    }

    private String resolveBindingDisplayName(ProjectGitlabBindingEntity binding) {
        if (hasText(binding.getGitlabProjectPath())) {
            return binding.getGitlabProjectPath().trim();
        }
        if (hasText(binding.getGitlabProjectRef())) {
            return binding.getGitlabProjectRef().trim();
        }
        return "GitLab 绑定 #" + binding.getId();
    }

    private String prettyJson(Object value) {
        try {
            return objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(value);
        } catch (Exception exception) {
            return defaultString(String.valueOf(value));
        }
    }

    private String resolveMessage(RuntimeException exception, String fallback) {
        if (exception == null || !hasText(exception.getMessage())) {
            return fallback;
        }
        return exception.getMessage().trim();
    }

    private String limit(String value, int maxLength) {
        String normalized = defaultString(value).trim();
        if (normalized.length() <= maxLength) {
            return normalized;
        }
        return normalized.substring(0, maxLength);
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private String defaultString(String value) {
        return value == null ? "" : value;
    }

    public record TestAutomationExecutionResult(String outputSummary,
                                                List<ExecutionArtifactEntity> artifacts,
                                                boolean canceled) {
    }

    public static class TestAutomationExecutionStepException extends RuntimeException {

        private final ExecutionStepEntity failedStep;
        private final List<ExecutionArtifactEntity> artifacts;
        private final String outputSummary;

        public TestAutomationExecutionStepException(ExecutionStepEntity failedStep,
                                                    RuntimeException cause,
                                                    List<ExecutionArtifactEntity> artifacts,
                                                    String outputSummary) {
            super(cause == null ? null : cause.getMessage(), cause);
            this.failedStep = failedStep;
            this.artifacts = artifacts;
            this.outputSummary = outputSummary;
        }

        public ExecutionStepEntity failedStep() {
            return failedStep;
        }

        public List<ExecutionArtifactEntity> artifacts() {
            return artifacts;
        }

        public String outputSummary() {
            return outputSummary;
        }
    }

    private record FailureContext(ExecutionStepEntity failedStep, RuntimeException exception) {
    }

    private record ImplementResult(String markdown, String mergeRequestUrl) {
    }

    private record TestExecutionResult(String status,
                                       String summary,
                                       JsonNode rawPayload,
                                       String testPlanJson,
                                       String markdown) {
    }

    private record AutomationTaskPayload(String mode,
                                         Long testPlanId,
                                         Long bindingId,
                                         String targetBranch) {
    }
}
