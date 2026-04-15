package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.AgentEntity;
import com.aiclub.platform.domain.model.ExecutionArtifactEntity;
import com.aiclub.platform.domain.model.ExecutionRunEntity;
import com.aiclub.platform.domain.model.ExecutionStepEntity;
import com.aiclub.platform.domain.model.ExecutionTaskEntity;
import com.aiclub.platform.domain.model.ProjectGitlabBindingEntity;
import com.aiclub.platform.domain.model.RepositoryScanRulesetEntity;
import com.aiclub.platform.repository.ExecutionArtifactRepository;
import com.aiclub.platform.repository.ExecutionRunRepository;
import com.aiclub.platform.repository.ExecutionStepRepository;
import com.aiclub.platform.repository.ExecutionTaskRepository;
import com.aiclub.platform.repository.ProjectGitlabBindingRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.concurrent.CancellationException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/**
 * 仓库规范扫描执行服务。
 * 该服务负责把执行中心中的扫描任务转换为 code-processing 的分步调用，并沉淀执行产物。
 */
@Service
public class RepositoryScanExecutionService {

    private static final Logger log = LoggerFactory.getLogger(RepositoryScanExecutionService.class);
    private static final int TOTAL_STEPS = 8;

    private final ProjectGitlabBindingRepository projectGitlabBindingRepository;
    private final ExecutionStepRepository executionStepRepository;
    private final ExecutionRunRepository executionRunRepository;
    private final ExecutionArtifactRepository executionArtifactRepository;
    private final ExecutionTaskRepository executionTaskRepository;
    private final RepositoryScanClientService repositoryScanClientService;
    private final RepositoryScanRulesetService repositoryScanRulesetService;
    private final AgentExecutionService agentExecutionService;
    private final TokenCipherService tokenCipherService;
    private final GitlabApiService gitlabApiService;
    private final ObjectMapper objectMapper;
    private final TransactionTemplate requiresNewTransactionTemplate;

    public RepositoryScanExecutionService(ProjectGitlabBindingRepository projectGitlabBindingRepository,
                                          ExecutionStepRepository executionStepRepository,
                                          ExecutionRunRepository executionRunRepository,
                                          ExecutionArtifactRepository executionArtifactRepository,
                                          ExecutionTaskRepository executionTaskRepository,
                                          RepositoryScanClientService repositoryScanClientService,
                                          RepositoryScanRulesetService repositoryScanRulesetService,
                                          AgentExecutionService agentExecutionService,
                                          TokenCipherService tokenCipherService,
                                          GitlabApiService gitlabApiService,
                                          ObjectMapper objectMapper,
                                          PlatformTransactionManager transactionManager) {
        this.projectGitlabBindingRepository = projectGitlabBindingRepository;
        this.executionStepRepository = executionStepRepository;
        this.executionRunRepository = executionRunRepository;
        this.executionArtifactRepository = executionArtifactRepository;
        this.executionTaskRepository = executionTaskRepository;
        this.repositoryScanClientService = repositoryScanClientService;
        this.repositoryScanRulesetService = repositoryScanRulesetService;
        this.agentExecutionService = agentExecutionService;
        this.tokenCipherService = tokenCipherService;
        this.gitlabApiService = gitlabApiService;
        this.objectMapper = objectMapper;
        this.requiresNewTransactionTemplate = new TransactionTemplate(transactionManager);
        this.requiresNewTransactionTemplate.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    /**
     * 执行一条仓库规范扫描任务。
     * 扫描步骤失败时需要保留已经写入的步骤状态与日志，因此这里显式禁止对
     * `RepositoryScanStepException` 做事务回滚，避免外层失败摘要再引用不到步骤记录。
     */
    public RepositoryScanExecutionResult executeScanTask(ExecutionTaskEntity executionTask, ExecutionRunEntity executionRun) {
        ScanTaskPayload payload = readPayload(executionTask.getInputPayload());
        ProjectGitlabBindingEntity binding = requireBinding(payload.bindingId());
        List<ExecutionArtifactEntity> artifacts = new ArrayList<>();
        String runKey = "scan-" + executionTask.getId() + "-run-" + executionRun.getRunNo();
        String branch = hasText(payload.branch())
                ? payload.branch().trim()
                : (hasText(binding.getDefaultTargetBranch()) ? binding.getDefaultTargetBranch().trim() : "main");
        RulesetSnapshot rulesetSnapshot = resolveRulesetSnapshot(payload);
        try {
            ResolvedRepositoryContext resolved = resolveRepository(executionTask, executionRun, binding, branch, rulesetSnapshot);
            RepositoryScanClientService.PrepareScanResponse prepare = cloneRepository(executionTask, executionRun, resolved, runKey, rulesetSnapshot);
            runSemgrep(executionTask, executionRun, runKey, rulesetSnapshot);
            RepositoryScanClientService.NormalizeResponse normalize = normalizeFindings(executionTask, executionRun, runKey);
            RepositoryScanClientService.FixPlanResponse fixPlan = buildFixPlan(executionTask, executionRun, runKey, resolved.repoDisplayName());
            RepositoryScanClientService.SummarizeResponse report = summarizeReport(executionTask, executionRun, runKey, resolved.repoDisplayName());
            RepositoryScanClientService.PackageScanResponse basePackaged = publishBaseReport(executionTask, executionRun, runKey);
            saveArtifacts(executionRun, basePackaged, artifacts);
            if (isCancelRequested(executionTask.getId())) {
                return new RepositoryScanExecutionResult("仓库扫描已取消，基础扫描报告已发布。", artifacts, true);
            }
            ExecutablePlanResult executablePlanResult = buildExecutablePlan(
                    executionTask,
                    executionRun,
                    payload,
                    binding,
                    resolved.repoDisplayName(),
                    runKey,
                    fixPlan,
                    report
            );
            if (executablePlanResult.packageResponse() != null) {
                saveArtifacts(executionRun, executablePlanResult.packageResponse(), artifacts);
            }
            String summaryText = hasText(basePackaged.summaryText())
                    ? basePackaged.summaryText().trim()
                    : buildFallbackSummary(normalize, prepare);
            summaryText = appendExecutablePlanSummary(summaryText, executablePlanResult);
            executionRun.setOutputSummary(summaryText);
            executionRun.setUpdatedAt(LocalDateTime.now());
            executionRunRepository.save(executionRun);
            return new RepositoryScanExecutionResult(summaryText, artifacts, executablePlanResult.canceled());
        } finally {
            try {
                repositoryScanClientService.cleanupScan(runKey);
            } catch (RuntimeException exception) {
                log.warn("清理仓库扫描工作目录失败: executionTaskId={}, runKey={}, message={}",
                        executionTask.getId(), runKey, exception.getMessage(), exception);
            }
        }
    }

    private ResolvedRepositoryContext resolveRepository(ExecutionTaskEntity executionTask,
                                                        ExecutionRunEntity executionRun,
                                                        ProjectGitlabBindingEntity binding,
                                                        String branch,
                                                        RulesetSnapshot rulesetSnapshot) {
        ExecutionStepEntity step = beginStep(executionRun, 1, "RESOLVE_REPO", "解析仓库信息", executionTask.getInputPayload());
        try {
            String token = tokenCipherService.decrypt(binding.getTokenCiphertext());
            ProjectGitlabBindingEntity latestBinding = refreshCloneUrlsIfRequired(binding, token);
            String repoUrl = resolveCloneUrl(latestBinding);
            if (!hasText(repoUrl)) {
                throw new IllegalStateException("当前绑定仓库缺少可用的 HTTP Clone 地址，请先执行连接测试");
            }
            String repoDisplayName = hasText(latestBinding.getGitlabProjectPath())
                    ? latestBinding.getGitlabProjectPath().trim()
                    : latestBinding.getGitlabProjectRef().trim();
            completeStep(step, "已解析仓库：" + repoDisplayName + "，分支：" + branch + "，规则集：" + rulesetSnapshot.name() + "（" + rulesetSnapshot.code() + "）");
            updateRunProgress(executionRun, 1);
            updateTaskSummary(executionTask, "执行中：解析仓库信息");
            return new ResolvedRepositoryContext(
                    repoUrl,
                    latestBinding.getApiBaseUrl(),
                    repoDisplayName,
                    token,
                    repoDisplayName,
                    branch
            );
        } catch (RuntimeException exception) {
            throw failStep(step, exception, List.of());
        }
    }

    private RepositoryScanClientService.PrepareScanResponse cloneRepository(ExecutionTaskEntity executionTask,
                                                                            ExecutionRunEntity executionRun,
                                                                            ResolvedRepositoryContext resolved,
                                                                            String runKey,
                                                                            RulesetSnapshot rulesetSnapshot) {
        ExecutionStepEntity step = beginStep(executionRun, 2, "CLONE_REPO", "克隆仓库", resolved.repoUrl());
        try {
            if (!hasText(resolved.repoUrl()) || !isHttpCloneUrl(resolved.repoUrl())) {
                throw new IllegalStateException("仓库 HTTP Clone 地址为空或格式不正确，请先在仓库绑定中执行连接测试");
            }
            if (!hasText(resolved.authToken())) {
                throw new IllegalStateException("仓库绑定 Token 为空，无法克隆仓库");
            }
            RepositoryScanClientService.PrepareScanResponse response = repositoryScanClientService.prepareScan(
                    new RepositoryScanClientService.PrepareScanRequest(
                            runKey,
                            resolved.repoUrl(),
                            resolved.apiBaseUrl(),
                            resolved.projectRef(),
                            resolved.branch(),
                            resolved.authToken(),
                            rulesetSnapshot.code(),
                            resolved.repoDisplayName()
                    )
            );
            completeStep(step, "仓库已克隆，提交：" + defaultString(response.commitSha()));
            updateRunProgress(executionRun, 2);
            updateTaskSummary(executionTask, "执行中：克隆仓库");
            return response;
        } catch (RuntimeException exception) {
            throw failStep(step, exception, List.of());
        }
    }

    private void runSemgrep(ExecutionTaskEntity executionTask,
                            ExecutionRunEntity executionRun,
                            String runKey,
                            RulesetSnapshot rulesetSnapshot) {
        ExecutionStepEntity step = beginStep(executionRun, 3, "RUN_SEMGREP", "运行 Semgrep", rulesetSnapshot.code());
        try {
            RepositoryScanClientService.SemgrepResponse response = repositoryScanClientService.runSemgrep(
                    runKey,
                    rulesetSnapshot.code(),
                    rulesetSnapshot.name(),
                    rulesetSnapshot.engineType(),
                    rulesetSnapshot.definitionContent()
            );
            completeStep(step, "规则集：" + rulesetSnapshot.name() + "（" + rulesetSnapshot.code() + "），扫描文件数：" + safeNumber(response.scannedFileCount()) + "，问题数：" + safeNumber(response.totalFindings()));
            updateRunProgress(executionRun, 3);
            updateTaskSummary(executionTask, "执行中：运行 Semgrep");
        } catch (RuntimeException exception) {
            throw failStep(step, exception, List.of());
        }
    }

    private RepositoryScanClientService.NormalizeResponse normalizeFindings(ExecutionTaskEntity executionTask,
                                                                            ExecutionRunEntity executionRun,
                                                                            String runKey) {
        ExecutionStepEntity step = beginStep(executionRun, 4, "BUILD_FINDING_INDEX", "整理问题索引", runKey);
        try {
            RepositoryScanClientService.NormalizeResponse response = repositoryScanClientService.normalizeScan(runKey);
            completeStep(step, defaultString(response.summaryText()));
            updateRunProgress(executionRun, 4);
            updateTaskSummary(executionTask, "执行中：整理问题索引");
            return response;
        } catch (RuntimeException exception) {
            throw failStep(step, exception, List.of());
        }
    }

    private RepositoryScanClientService.SummarizeResponse summarizeReport(ExecutionTaskEntity executionTask,
                                                                          ExecutionRunEntity executionRun,
                                                                          String runKey,
                                                                          String repoDisplayName) {
        ExecutionStepEntity step = beginStep(executionRun, 6, "GENERATE_REPORT_SUMMARY", "生成扫描报告", repoDisplayName);
        try {
            RepositoryScanClientService.SummarizeResponse response = repositoryScanClientService.summarizeScan(runKey, repoDisplayName);
            completeStep(step, "已生成扫描报告摘要");
            updateRunProgress(executionRun, 6);
            updateTaskSummary(executionTask, "执行中：生成扫描报告");
            return response;
        } catch (RuntimeException exception) {
            throw failStep(step, exception, List.of());
        }
    }

    private RepositoryScanClientService.FixPlanResponse buildFixPlan(ExecutionTaskEntity executionTask,
                                                                     ExecutionRunEntity executionRun,
                                                                     String runKey,
                                                                     String repoDisplayName) {
        ExecutionStepEntity step = beginStep(executionRun, 5, "BUILD_FIX_PLAN", "生成修复计划", repoDisplayName);
        try {
            RepositoryScanClientService.FixPlanResponse response = repositoryScanClientService.buildFixPlan(runKey, repoDisplayName);
            completeStep(
                    step,
                    "已生成修复计划：问题 "
                            + safeNumber(response.totalFindings())
                            + " 个，可执行候选 "
                            + safeNumber(response.autoExecutableFindingCount())
                            + " 个，分片 "
                            + safeNumber(response.shardCount())
                            + " 个"
            );
            updateRunProgress(executionRun, 5);
            updateTaskSummary(executionTask, "执行中：生成修复计划");
            return response;
        } catch (RuntimeException exception) {
            throw failStep(step, exception, List.of());
        }
    }

    /**
     * 规则版计划和扫描报告生成完成后，再由可选的计划智能体深化为 executable plan。
     * 当前步骤故意采用软失败策略，避免 AI 计划生成波动拖垮整条扫描主链路。
     */
    private ExecutablePlanResult buildExecutablePlan(ExecutionTaskEntity executionTask,
                                                     ExecutionRunEntity executionRun,
                                                     ScanTaskPayload payload,
                                                     ProjectGitlabBindingEntity binding,
                                                     String repoDisplayName,
                                                     String runKey,
                                                     RepositoryScanClientService.FixPlanResponse fixPlanResponse,
                                                     RepositoryScanClientService.SummarizeResponse summarizeResponse) {
        AgentEntity planAgent = resolvePlanAgent(payload.planAgentId());
        Long visibleStepId = startVisibleExecutablePlanStep(executionTask.getId(), executionRun.getId(), repoDisplayName, planAgent);
        try {
            ExecutablePlanResult executablePlanResult;
            if (isCancelRequested(executionTask.getId())) {
                executablePlanResult = buildCanceledExecutablePlan();
            } else if (payload.planAgentId() == null) {
                executablePlanResult = buildSkippedExecutablePlan();
            } else {
                List<ExecutablePlanShard> shardDefinitions = resolveExecutablePlanShards(
                        fixPlanResponse == null ? null : fixPlanResponse.fixShardsJson(),
                        summarizeResponse == null ? null : summarizeResponse.reportMarkdown()
                );
                if (shardDefinitions.isEmpty()) {
                    executablePlanResult = buildEmptyExecutablePlan();
                } else {
                    executablePlanResult = analyzeExecutablePlanShards(
                            executionTask,
                            executionRun,
                            payload,
                            binding,
                            repoDisplayName,
                            fixPlanResponse,
                            summarizeResponse,
                            shardDefinitions,
                            visibleStepId
                    );
                }
            }
            ExecutablePlanResult packagedResult = attachExecutablePlanArtifacts(runKey, executionTask, executionRun, executablePlanResult);
            completeOrCancelVisibleExecutablePlanStep(visibleStepId, packagedResult);
            updateRunProgress(executionRun, 8);
            updateTaskSummary(executionTask, packagedResult.canceled() ? "执行已取消" : "执行中：生成 AI 可执行计划");
            return packagedResult;
        } catch (RuntimeException exception) {
            ExecutablePlanResult fallbackResult = buildFailedSoftExecutablePlan("AI 可执行计划生成异常：" + resolveMessage(exception));
            ExecutablePlanResult packagedFallback = attachExecutablePlanArtifacts(runKey, executionTask, executionRun, fallbackResult);
            completeOrCancelVisibleExecutablePlanStep(visibleStepId, packagedFallback);
            updateRunProgress(executionRun, 8);
            updateTaskSummary(executionTask, "执行中：生成 AI 可执行计划");
            return packagedFallback;
        }
    }

    private ExecutablePlanResult analyzeExecutablePlanShards(ExecutionTaskEntity executionTask,
                                                             ExecutionRunEntity executionRun,
                                                             ScanTaskPayload payload,
                                                             ProjectGitlabBindingEntity binding,
                                                             String repoDisplayName,
                                                             RepositoryScanClientService.FixPlanResponse fixPlanResponse,
                                                             RepositoryScanClientService.SummarizeResponse summarizeResponse,
                                                             List<ExecutablePlanShard> shardDefinitions,
                                                             Long stepId) {
        List<ExecutablePlanShardAnalysis> shardAnalyses = new ArrayList<>();
        int totalShards = shardDefinitions.size();
        for (int index = 0; index < shardDefinitions.size(); index++) {
            if (isCancelRequested(executionTask.getId())) {
                return buildCanceledExecutablePlan();
            }
            ExecutablePlanShard shard = shardDefinitions.get(index);
            int progressStart = 5 + index * 80 / Math.max(totalShards, 1);
            int progressEnd = 5 + (index + 1) * 80 / Math.max(totalShards, 1);
            String runningMessage = "基础扫描报告已发布，AI 正在分析分片 " + (index + 1) + "/" + totalShards + "：" + defaultString(shard.title());
            updateVisibleExecutablePlanStepProgress(stepId, progressStart, runningMessage);
            try {
                String rawOutput = runPlanAgentWithCancellation(
                        executionTask.getId(),
                        payload.planAgentId(),
                        buildShardAnalysisInput(repoDisplayName, fixPlanResponse, summarizeResponse, shard, index + 1, totalShards),
                        buildExecutablePlanVariables(executionTask, executionRun, payload, binding),
                        stepId,
                        progressStart,
                        progressEnd,
                        runningMessage
                );
                shardAnalyses.add(parseShardAnalysis(rawOutput, shard));
            } catch (PlanExecutionCanceledException exception) {
                return buildCanceledExecutablePlan();
            } catch (RuntimeException exception) {
                shardAnalyses.add(ExecutablePlanShardAnalysis.failedSoft(shard, "分片分析失败：" + resolveMessage(exception)));
            }
            updateVisibleExecutablePlanStepProgress(stepId, Math.max(progressStart, progressEnd - 1), "已完成分片 " + (index + 1) + "/" + totalShards + "：" + defaultString(shard.title()));
        }
        updateVisibleExecutablePlanStepProgress(stepId, 95, "已完成分片分析，正在汇总 executable plan");
        return mergeExecutablePlanFromShardAnalyses(payload, shardAnalyses);
    }

    private RepositoryScanClientService.PackageScanResponse publishBaseReport(ExecutionTaskEntity executionTask,
                                                                              ExecutionRunEntity executionRun,
                                                                              String runKey) {
        ExecutionStepEntity step = beginStep(executionRun, 7, "PUBLISH_REPORT", "发布扫描报告", runKey);
        try {
            RepositoryScanClientService.PackageScanResponse response = repositoryScanClientService.packageScan(
                    new RepositoryScanClientService.PackageScanRequest(
                            runKey,
                            executionTask.getId(),
                            executionRun.getRunNo(),
                            "",
                            "",
                            "",
                            ""
                    )
            );
            int artifactCount = response.artifacts() == null ? 0 : response.artifacts().size();
            completeStep(step, "已生成 " + artifactCount + " 个产物");
            updateRunProgress(executionRun, 7);
            updateTaskSummary(executionTask, "执行中：发布扫描报告");
            return response;
        } catch (RuntimeException exception) {
            throw failStep(step, exception, List.of());
        }
    }

    /**
     * 把 code-processing 返回的对象键保存为执行产物记录。
     */
    private void saveArtifacts(ExecutionRunEntity executionRun,
                               RepositoryScanClientService.PackageScanResponse packaged,
                               List<ExecutionArtifactEntity> artifacts) {
        if (packaged == null || packaged.artifacts() == null) {
            return;
        }
        List<ExecutionArtifactEntity> savedArtifacts = requiresNewTransactionTemplate.execute(status -> {
            ExecutionRunEntity managedRun = executionRunRepository.findById(executionRun.getId())
                    .orElseThrow(() -> new NoSuchElementException("执行运行不存在: " + executionRun.getId()));
            List<ExecutionArtifactEntity> result = new ArrayList<>();
            for (RepositoryScanClientService.PackageArtifactResponse item : packaged.artifacts()) {
                ExecutionArtifactEntity artifact = new ExecutionArtifactEntity();
                artifact.setRun(managedRun);
                artifact.setArtifactType(defaultString(item.artifactType()));
                artifact.setTitle(defaultString(item.title()));
                artifact.setContentRef(defaultString(item.objectKey()));
                artifact.setContentText(defaultString(item.previewText()));
                artifact.setWorkItemWritebackFlag(false);
                result.add(executionArtifactRepository.save(artifact));
            }
            return result;
        });
        if (savedArtifacts != null) {
            artifacts.addAll(savedArtifacts);
        }
    }

    /**
     * 基础报告发布完成后，立即在独立事务里把 AI 分析步骤写出来，让前端轮询时能马上看到“正在生成AI可执行计划”。
     */
    private Long startVisibleExecutablePlanStep(Long executionTaskId,
                                                Long executionRunId,
                                                String repoDisplayName,
                                                AgentEntity planAgent) {
        return requiresNewTransactionTemplate.execute(status -> {
            ExecutionRunEntity managedRun = executionRunRepository.findById(executionRunId)
                    .orElseThrow(() -> new NoSuchElementException("执行运行不存在: " + executionRunId));
            ExecutionTaskEntity managedTask = executionTaskRepository.findById(executionTaskId)
                    .orElseThrow(() -> new NoSuchElementException("执行任务不存在: " + executionTaskId));
            ExecutionStepEntity step = new ExecutionStepEntity();
            step.setRun(managedRun);
            step.setStepNo(8);
            step.setStepCode("BUILD_EXEC_PLAN");
            step.setStepName("生成 AI 可执行计划");
            step.setAgent(planAgent);
            step.setStatus("RUNNING");
            step.setProgressPercent(5);
            step.setLatestMessage("基础扫描报告已发布，AI 正在准备分片分析");
            step.setInputSnapshot(defaultString(repoDisplayName));
            step.setStartedAt(LocalDateTime.now());
            ExecutionStepEntity savedStep = executionStepRepository.save(step);

            managedRun.setCurrentStepNo(8);
            managedRun.setProgressPercent(88);
            managedRun.setUpdatedAt(LocalDateTime.now());
            executionRunRepository.save(managedRun);

            managedTask.setLatestSummary("基础扫描报告已发布，AI 正在准备分片分析");
            executionTaskRepository.save(managedTask);
            return savedStep.getId();
        });
    }

    private void updateVisibleExecutablePlanStepProgress(Long stepId, int progressPercent, String latestMessage) {
        requiresNewTransactionTemplate.executeWithoutResult(status -> {
            ExecutionStepEntity step = executionStepRepository.findById(stepId)
                    .orElseThrow(() -> new NoSuchElementException("执行步骤不存在: " + stepId));
            if (!"RUNNING".equals(step.getStatus())) {
                return;
            }
            step.setProgressPercent(Math.max(5, Math.min(progressPercent, 95)));
            step.setLatestMessage(defaultString(latestMessage));
            executionStepRepository.save(step);

            ExecutionRunEntity run = step.getRun();
            run.setCurrentStepNo(step.getStepNo());
            run.setProgressPercent(Math.max(88, Math.min(98, 88 + progressPercent / 10)));
            run.setUpdatedAt(LocalDateTime.now());
            executionRunRepository.save(run);

            ExecutionTaskEntity task = run.getExecutionTask();
            task.setLatestSummary(defaultString(latestMessage));
            executionTaskRepository.save(task);
        });
    }

    private void completeOrCancelVisibleExecutablePlanStep(Long stepId, ExecutablePlanResult result) {
        requiresNewTransactionTemplate.executeWithoutResult(status -> {
            ExecutionStepEntity step = executionStepRepository.findById(stepId)
                    .orElseThrow(() -> new NoSuchElementException("执行步骤不存在: " + stepId));
            if (result != null && result.canceled()) {
                step.setStatus("CANCELED");
                step.setLatestMessage("执行已取消");
            } else {
                step.setStatus("SUCCESS");
                step.setLatestMessage("执行完成");
            }
            step.setProgressPercent(100);
            step.setOutputSnapshot(result == null ? "" : defaultString(result.stepOutput()));
            step.setFinishedAt(LocalDateTime.now());
            executionStepRepository.save(step);
        });
    }

    private ExecutionStepEntity beginStep(ExecutionRunEntity executionRun, int stepNo, String stepCode, String stepName, String inputSnapshot) {
        return beginStep(executionRun, stepNo, stepCode, stepName, inputSnapshot, null);
    }

    private ExecutionStepEntity beginStep(ExecutionRunEntity executionRun,
                                          int stepNo,
                                          String stepCode,
                                          String stepName,
                                          String inputSnapshot,
                                          AgentEntity agent) {
        ExecutionStepEntity step = new ExecutionStepEntity();
        step.setRun(executionRun);
        step.setStepNo(stepNo);
        step.setStepCode(stepCode);
        step.setStepName(stepName);
        step.setAgent(agent);
        step.setStatus("RUNNING");
        step.setProgressPercent(0);
        step.setLatestMessage("开始执行");
        step.setInputSnapshot(defaultString(inputSnapshot));
        step.setStartedAt(LocalDateTime.now());
        ExecutionStepEntity savedStep = executionStepRepository.save(step);
        executionRun.setStatus("RUNNING");
        executionRun.setCurrentStepNo(stepNo);
        executionRun.setUpdatedAt(LocalDateTime.now());
        executionRunRepository.save(executionRun);
        return savedStep;
    }

    private void completeStep(ExecutionStepEntity step, String outputSnapshot) {
        step.setStatus("SUCCESS");
        step.setProgressPercent(100);
        step.setLatestMessage("执行完成");
        step.setOutputSnapshot(defaultString(outputSnapshot));
        step.setFinishedAt(LocalDateTime.now());
        executionStepRepository.save(step);
    }

    private void completeCanceledStep(ExecutionStepEntity step, String outputSnapshot) {
        step.setStatus("CANCELED");
        step.setProgressPercent(100);
        step.setLatestMessage("执行已取消");
        step.setOutputSnapshot(defaultString(outputSnapshot));
        step.setFinishedAt(LocalDateTime.now());
        executionStepRepository.save(step);
    }

    private void completeOrCancelStep(ExecutionStepEntity step, ExecutablePlanResult result) {
        if (result != null && result.canceled()) {
            completeCanceledStep(step, result.stepOutput());
            return;
        }
        completeStep(step, result == null ? "" : result.stepOutput());
    }

    private RepositoryScanStepException failStep(ExecutionStepEntity step, RuntimeException exception, List<ExecutionArtifactEntity> artifacts) {
        step.setStatus("FAILED");
        step.setProgressPercent(100);
        String message = abbreviate(resolveMessage(exception), 900);
        step.setLatestMessage(message);
        step.setErrorMessage(resolveMessage(exception));
        step.setFinishedAt(LocalDateTime.now());
        ExecutionStepEntity savedStep = executionStepRepository.save(step);
        return new RepositoryScanStepException(savedStep, resolveMessage(exception), artifacts);
    }

    private void updateRunProgress(ExecutionRunEntity executionRun, int completedStepNo) {
        executionRun.setProgressPercent(completedStepNo * 100 / TOTAL_STEPS);
        executionRun.setUpdatedAt(LocalDateTime.now());
        executionRunRepository.save(executionRun);
    }

    private void updateTaskSummary(ExecutionTaskEntity executionTask, String latestSummary) {
        executionTask.setLatestSummary(latestSummary);
        executionTaskRepository.save(executionTask);
    }

    /**
     * 如果绑定仓库还没有 clone 地址，这里即时回源 GitLab 刷新一次，避免任务直接失败。
     */
    private ProjectGitlabBindingEntity refreshCloneUrlsIfRequired(ProjectGitlabBindingEntity binding, String token) {
        if (hasText(binding.getGitlabHttpCloneUrl())) {
            return binding;
        }
        GitlabApiService.GitlabProject project = gitlabApiService.fetchProject(binding.getApiBaseUrl(), token, binding.getGitlabProjectRef());
        binding.setGitlabProjectId(project.id());
        binding.setGitlabProjectName(project.name());
        binding.setGitlabProjectPath(project.pathWithNamespace());
        binding.setGitlabProjectWebUrl(project.webUrl());
        binding.setGitlabHttpCloneUrl(project.httpCloneUrl());
        binding.setGitlabSshCloneUrl(project.sshCloneUrl());
        if (!hasText(binding.getDefaultTargetBranch()) && hasText(project.defaultBranch())) {
            binding.setDefaultTargetBranch(project.defaultBranch());
        }
        return projectGitlabBindingRepository.save(binding);
    }

    private String resolveCloneUrl(ProjectGitlabBindingEntity binding) {
        if (hasText(binding.getGitlabHttpCloneUrl())) {
            return binding.getGitlabHttpCloneUrl().trim();
        }
        if (hasText(binding.getGitlabProjectWebUrl())) {
            String webUrl = binding.getGitlabProjectWebUrl().trim();
            return webUrl.endsWith(".git") ? webUrl : webUrl + ".git";
        }
        return null;
    }

    private boolean isHttpCloneUrl(String repoUrl) {
        String normalized = repoUrl == null ? "" : repoUrl.trim().toLowerCase();
        return normalized.startsWith("http://") || normalized.startsWith("https://");
    }

    private ScanTaskPayload readPayload(String inputPayload) {
        try {
            JsonNode node = objectMapper.readTree(inputPayload);
            JsonNode rulesetSnapshotNode = node.path("rulesetSnapshot");
            return new ScanTaskPayload(
                    node.path("bindingId").asLong(),
                    node.path("branch").asText(""),
                    node.path("rulesetCode").asText(""),
                    readRulesetSnapshot(rulesetSnapshotNode),
                    node.hasNonNull("planAgentId") ? node.get("planAgentId").asLong() : null,
                    node.path("planAgentName").asText(""),
                    node.path("projectName").asText("")
            );
        } catch (Exception exception) {
            throw new IllegalStateException("扫描任务输入载荷解析失败", exception);
        }
    }

    /**
     * 优先使用任务创建时固化的规则快照。
     * 老任务未携带快照时，再按 rulesetCode 从数据库回填，保持兼容。
     */
    private RulesetSnapshot resolveRulesetSnapshot(ScanTaskPayload payload) {
        if (payload.rulesetSnapshot() != null && hasText(payload.rulesetSnapshot().definitionContent())) {
            return payload.rulesetSnapshot();
        }
        String rulesetCode = hasText(payload.rulesetCode()) ? payload.rulesetCode().trim() : repositoryScanRulesetService.requireDefaultRuleset().getCode();
        RepositoryScanRulesetEntity ruleset = repositoryScanRulesetService.requireRulesetByCode(rulesetCode);
        return new RulesetSnapshot(
                defaultString(ruleset.getCode()),
                defaultString(ruleset.getName()),
                defaultString(ruleset.getEngineType()),
                defaultString(ruleset.getDefinitionContent())
        );
    }

    /**
     * 从执行任务输入载荷中提取规则快照。
     */
    private RulesetSnapshot readRulesetSnapshot(JsonNode rulesetSnapshotNode) {
        if (rulesetSnapshotNode == null || rulesetSnapshotNode.isMissingNode() || rulesetSnapshotNode.isNull()) {
            return null;
        }
        return new RulesetSnapshot(
                rulesetSnapshotNode.path("code").asText(""),
                rulesetSnapshotNode.path("name").asText(""),
                rulesetSnapshotNode.path("engineType").asText(""),
                rulesetSnapshotNode.path("definitionContent").asText("")
        );
    }

    private ProjectGitlabBindingEntity requireBinding(Long bindingId) {
        return projectGitlabBindingRepository.findById(bindingId)
                .orElseThrow(() -> new NoSuchElementException("GitLab 仓库绑定不存在: " + bindingId));
    }

    private String buildFallbackSummary(RepositoryScanClientService.NormalizeResponse normalize,
                                        RepositoryScanClientService.PrepareScanResponse prepare) {
        return "仓库 " + defaultString(prepare == null ? null : prepare.repoDisplayName()) + " 扫描完成，共发现 "
                + safeNumber(normalize == null ? null : normalize.totalFindings()) + " 个问题。";
    }

    private AgentEntity resolvePlanAgent(Long planAgentId) {
        if (planAgentId == null) {
            return null;
        }
        try {
            return agentExecutionService.loadAgent(planAgentId);
        } catch (RuntimeException ignored) {
            return null;
        }
    }

    /**
     * 为计划智能体构造统一输入，既包含扫描报告，也包含规则版 fix-plan/fix-shards 摘要。
     */
    private String buildRepositoryScanPlanInput(String repoDisplayName,
                                                RepositoryScanClientService.FixPlanResponse fixPlanResponse,
                                                RepositoryScanClientService.SummarizeResponse summarizeResponse) {
        String fixPlanMarkdown = limitContextSection(fixPlanResponse == null ? null : fixPlanResponse.fixPlanMarkdown(), 12000);
        String fixShardsMarkdown = limitContextSection(fixPlanResponse == null ? null : fixPlanResponse.fixShardsMarkdown(), 12000);
        String reportMarkdown = limitContextSection(summarizeResponse == null ? null : summarizeResponse.reportMarkdown(), 12000);
        String shardIds = String.join("、", extractShardIds(fixPlanResponse == null ? null : fixPlanResponse.fixShardsJson()));
        return """
                仓库：%s
                你的任务：基于规则版修复计划和扫描报告，生成后续 code agent 可执行计划。
                输出必须是 JSON，并遵守系统提示词约定。

                可用 shardId：
                %s

                ## 规则版修复计划
                %s

                ## 规则版修复分片
                %s

                ## 扫描报告
                %s
                """.formatted(
                defaultString(repoDisplayName),
                hasText(shardIds) ? shardIds : "当前没有可自动执行分片，请重点说明人工处理项。",
                defaultString(fixPlanMarkdown),
                defaultString(fixShardsMarkdown),
                defaultString(reportMarkdown)
        ).trim();
    }

    private String buildShardAnalysisInput(String repoDisplayName,
                                           RepositoryScanClientService.FixPlanResponse fixPlanResponse,
                                           RepositoryScanClientService.SummarizeResponse summarizeResponse,
                                           ExecutablePlanShard shard,
                                           int shardIndex,
                                           int totalShards) {
        String fixPlanMarkdown = limitContextSection(fixPlanResponse == null ? null : fixPlanResponse.fixPlanMarkdown(), 6000);
        String reportSegment = limitContextSection(
                hasText(shard.sourceMarkdown())
                        ? shard.sourceMarkdown()
                        : extractReportShardSection(summarizeResponse == null ? null : summarizeResponse.reportMarkdown(), shard.filePaths()),
                8000
        );
        String shardJson = safePrettyJson(shard.rawJson());
        return """
                仓库：%s
                当前任务：对扫描报告的分片做 AI 分析，输出当前分片的执行建议。
                当前分片：%d/%d

                你必须直接返回 JSON，不要输出 Markdown 代码块或额外解释。
                输出 JSON 结构必须是：
                {
                  "shardId": "%s",
                  "decision": "EXECUTE 或 MANUAL 或 SKIP",
                  "action": "建议执行动作",
                  "reason": "为什么这样判断",
                  "notes": ["补充说明"]
                }
                约束：
                1. shardId 必须等于 %s
                2. decision 只能是 EXECUTE、MANUAL、SKIP
                3. 所有字段内容请使用中文

                ## 分片定义
                %s

                ## 规则版计划摘要
                %s

                ## 当前分片相关扫描报告
                %s
                """.formatted(
                defaultString(repoDisplayName),
                shardIndex,
                totalShards,
                defaultString(shard.shardId()),
                defaultString(shard.shardId()),
                defaultString(shardJson),
                defaultString(fixPlanMarkdown),
                defaultString(reportSegment)
        ).trim();
    }

    private List<ExecutablePlanShard> resolveExecutablePlanShards(String fixShardsJson, String reportMarkdown) {
        List<ExecutablePlanShard> reportShards = buildReportAnalysisShards(reportMarkdown);
        if (!reportShards.isEmpty()) {
            return reportShards;
        }
        return parseExecutablePlanShardDefinitions(fixShardsJson);
    }

    private List<ExecutablePlanShard> parseExecutablePlanShardDefinitions(String fixShardsJson) {
        List<ExecutablePlanShard> shards = new ArrayList<>();
        if (!hasText(fixShardsJson)) {
            return shards;
        }
        try {
            JsonNode root = objectMapper.readTree(fixShardsJson);
            for (JsonNode shardNode : root.path("shards")) {
                String shardId = shardNode.path("shardId").asText("").trim();
                if (!hasText(shardId)) {
                    continue;
                }
                List<String> filePaths = readStringArray(shardNode.path("filePaths"));
                shards.add(new ExecutablePlanShard(
                        shardId,
                        shardNode.path("title").asText(""),
                        readStringArray(shardNode.path("ruleIds")),
                        filePaths,
                        readStringArray(shardNode.path("validationCommands")),
                        shardNode.path("findingCount").asInt(0),
                        shardNode.toPrettyString(),
                        ""
                ));
            }
        } catch (Exception exception) {
            log.warn("解析 fix-shards 失败，当前轮次将跳过分片分析: message={}", exception.getMessage(), exception);
        }
        return shards;
    }

    private List<ExecutablePlanShard> buildReportAnalysisShards(String reportMarkdown) {
        List<ReportSection> sections = parseReportSections(reportMarkdown);
        if (sections.isEmpty()) {
            return List.of();
        }
        List<ExecutablePlanShard> result = new ArrayList<>();
        List<ReportSection> currentSections = new ArrayList<>();
        int currentChars = 0;
        int shardIndex = 1;
        for (ReportSection section : sections) {
            int nextChars = currentChars + section.content().length();
            if (!currentSections.isEmpty() && (currentSections.size() >= 5 || nextChars > 9000)) {
                result.add(finalizeReportShard(currentSections, shardIndex));
                currentSections = new ArrayList<>();
                currentChars = 0;
                shardIndex += 1;
            }
            currentSections.add(section);
            currentChars += section.content().length();
        }
        if (!currentSections.isEmpty()) {
            result.add(finalizeReportShard(currentSections, shardIndex));
        }
        return result;
    }

    private List<ReportSection> parseReportSections(String reportMarkdown) {
        if (!hasText(reportMarkdown)) {
            return List.of();
        }
        String[] blocks = reportMarkdown.split("(?m)^### ");
        List<ReportSection> sections = new ArrayList<>();
        for (String block : blocks) {
            String normalized = defaultString(block);
            if (!hasText(normalized)) {
                continue;
            }
            String heading = normalized.lines().findFirst().orElse("").trim();
            if (!hasText(heading)) {
                continue;
            }
            String content = "### " + normalized;
            sections.add(new ReportSection(heading, content));
        }
        return sections;
    }

    private ExecutablePlanShard finalizeReportShard(List<ReportSection> sections, int shardIndex) {
        List<String> filePaths = sections.stream().map(ReportSection::heading).toList();
        StringBuilder markdownBuilder = new StringBuilder();
        for (int index = 0; index < sections.size(); index++) {
            if (index > 0) {
                markdownBuilder.append("\n\n");
            }
            markdownBuilder.append(sections.get(index).content());
        }
        LinkedHashMap<String, Object> rawDefinition = new LinkedHashMap<>();
        rawDefinition.put("type", "REPORT_SECTION_SHARD");
        rawDefinition.put("filePaths", filePaths);
        rawDefinition.put("sectionCount", sections.size());
        return new ExecutablePlanShard(
                String.format("report-shard-%03d", shardIndex),
                "扫描报告分片 " + shardIndex,
                List.of(),
                filePaths,
                List.of("python scripts/check_encoding.py"),
                sections.size(),
                safePrettyJson(writeJsonSafely(rawDefinition)),
                markdownBuilder.toString()
        );
    }

    private ExecutablePlanShardAnalysis parseShardAnalysis(String rawOutput, ExecutablePlanShard shard) {
        try {
            JsonNode root = objectMapper.readTree(extractJsonObjectText(rawOutput));
            String shardId = root.path("shardId").asText("").trim();
            String decision = root.path("decision").asText("").trim().toUpperCase();
            if (!defaultString(shard.shardId()).equals(shardId)) {
                throw new IllegalArgumentException("分片分析返回了不匹配的 shardId");
            }
            if (!"EXECUTE".equals(decision) && !"MANUAL".equals(decision) && !"SKIP".equals(decision)) {
                throw new IllegalArgumentException("分片分析返回了不支持的 decision");
            }
            return new ExecutablePlanShardAnalysis(
                    shard.shardId(),
                    shard.title(),
                    decision,
                    root.path("action").asText(""),
                    root.path("reason").asText(""),
                    readStringArray(root.path("notes")),
                    shard.validationCommands(),
                    shard.findingCount()
            );
        } catch (Exception exception) {
            return ExecutablePlanShardAnalysis.failedSoft(shard, "分片分析输出校验失败：" + limitMessage(resolveMessage(exception)));
        }
    }

    private ExecutablePlanResult mergeExecutablePlanFromShardAnalyses(ScanTaskPayload payload,
                                                                      List<ExecutablePlanShardAnalysis> shardAnalyses) {
        List<ExecutablePlanShardAnalysis> executeItems = shardAnalyses.stream()
                .filter(item -> "EXECUTE".equalsIgnoreCase(item.decision()))
                .toList();
        List<ExecutablePlanShardAnalysis> manualItems = shardAnalyses.stream()
                .filter(item -> "MANUAL".equalsIgnoreCase(item.decision()))
                .toList();
        List<ExecutablePlanShardAnalysis> skippedItems = shardAnalyses.stream()
                .filter(item -> "SKIP".equalsIgnoreCase(item.decision()))
                .toList();

        String recommendedMode = executeItems.size() > 1 ? "PARALLEL" : "SEQUENTIAL";
        String summary = "已完成 " + shardAnalyses.size() + " 个分片分析，可执行 " + executeItems.size() + " 个，人工处理 " + manualItems.size() + " 个，跳过 " + skippedItems.size() + " 个。";
        String executionMarkdown = buildExecutablePlanMarkdown(summary, recommendedMode, executeItems, manualItems, skippedItems);

        LinkedHashMap<String, Object> payloadJson = new LinkedHashMap<>();
        payloadJson.put("status", "SUCCESS");
        payloadJson.put("summary", summary);
        payloadJson.put("recommendedMode", recommendedMode);
        payloadJson.put("executionMarkdown", executionMarkdown);
        payloadJson.put("planAgentId", payload.planAgentId());
        payloadJson.put("planAgentName", payload.planAgentName());
        payloadJson.put("shards", shardAnalyses);
        payloadJson.put("manualItems", manualItems.stream().map(ExecutablePlanShardAnalysis::toManualItem).toList());
        payloadJson.put("notes", shardAnalyses.stream().flatMap(item -> item.notes().stream()).distinct().toList());
        try {
            return new ExecutablePlanResult(
                    "SUCCESS",
                    summary,
                    executionMarkdown,
                    objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(payloadJson),
                    "已完成 " + shardAnalyses.size() + " 个分片分析，生成 executable plan",
                    null,
                    false
            );
        } catch (Exception exception) {
            return buildFailedSoftExecutablePlan("汇总 executable plan 失败：" + resolveMessage(exception));
        }
    }

    private String buildExecutablePlanMarkdown(String summary,
                                               String recommendedMode,
                                               List<ExecutablePlanShardAnalysis> executeItems,
                                               List<ExecutablePlanShardAnalysis> manualItems,
                                               List<ExecutablePlanShardAnalysis> skippedItems) {
        StringBuilder builder = new StringBuilder();
        builder.append("# AI 可执行计划\n\n");
        builder.append("## 概览\n");
        builder.append("- 摘要：").append(summary).append("\n");
        builder.append("- 推荐执行模式：").append(recommendedMode).append("\n\n");
        builder.append("## 可执行分片\n");
        if (executeItems.isEmpty()) {
            builder.append("- 当前没有建议直接交给 code agent 执行的分片。\n");
        } else {
            for (ExecutablePlanShardAnalysis item : executeItems) {
                builder.append("- ").append(defaultString(item.title())).append("（").append(defaultString(item.shardId())).append("）").append("\n");
                builder.append("  动作：").append(defaultString(item.action())).append("\n");
                builder.append("  原因：").append(defaultString(item.reason())).append("\n");
                if (!item.validationCommands().isEmpty()) {
                    builder.append("  验证：").append(String.join("；", item.validationCommands())).append("\n");
                }
            }
        }
        builder.append("\n## 需要人工处理\n");
        if (manualItems.isEmpty()) {
            builder.append("- 当前没有额外人工处理分片。\n");
        } else {
            for (ExecutablePlanShardAnalysis item : manualItems) {
                builder.append("- ").append(defaultString(item.title())).append("：").append(defaultString(item.reason())).append("\n");
            }
        }
        builder.append("\n## 已跳过分片\n");
        if (skippedItems.isEmpty()) {
            builder.append("- 当前没有被 AI 明确跳过的分片。\n");
        } else {
            for (ExecutablePlanShardAnalysis item : skippedItems) {
                builder.append("- ").append(defaultString(item.title())).append("：").append(defaultString(item.reason())).append("\n");
            }
        }
        return builder.toString().trim();
    }

    private String extractReportShardSection(String reportMarkdown, List<String> filePaths) {
        if (!hasText(reportMarkdown)) {
            return "";
        }
        if (filePaths == null || filePaths.isEmpty()) {
            return reportMarkdown;
        }
        List<String> normalizedTargets = filePaths.stream().map(this::defaultString).filter(this::hasText).toList();
        List<String> resultSections = new ArrayList<>();
        String[] sections = reportMarkdown.split("(?m)^### ");
        for (String section : sections) {
            String normalized = defaultString(section);
            if (!hasText(normalized)) {
                continue;
            }
            String heading = normalized.lines().findFirst().orElse("").trim();
            if (normalizedTargets.contains(heading)) {
                resultSections.add("### " + normalized);
            }
        }
        if (resultSections.isEmpty()) {
            return reportMarkdown;
        }
        return String.join("\n\n", resultSections);
    }

    private List<String> readStringArray(JsonNode node) {
        List<String> result = new ArrayList<>();
        if (node == null || !node.isArray()) {
            return result;
        }
        for (JsonNode item : node) {
            String value = item.asText("").trim();
            if (hasText(value)) {
                result.add(value);
            }
        }
        return result;
    }

    private String safePrettyJson(String rawJson) {
        if (!hasText(rawJson)) {
            return "{}";
        }
        try {
            return objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(objectMapper.readTree(rawJson));
        } catch (Exception ignored) {
            return rawJson;
        }
    }

    private String writeJsonSafely(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception exception) {
            return "{}";
        }
    }

    private Map<String, String> buildExecutablePlanVariables(ExecutionTaskEntity executionTask,
                                                             ExecutionRunEntity executionRun,
                                                             ScanTaskPayload payload,
                                                             ProjectGitlabBindingEntity binding) {
        LinkedHashMap<String, String> variables = new LinkedHashMap<>();
        variables.put("execution_task_id", String.valueOf(executionTask.getId()));
        variables.put("execution_run_id", String.valueOf(executionRun.getId()));
        variables.put("scenario_code", defaultString(executionTask.getScenarioCode()));
        variables.put("project_id", "");
        variables.put("project_name", defaultString(payload.projectName()));
        variables.put("plan_agent_name", defaultString(payload.planAgentName()));
        return variables;
    }

    private ExecutablePlanResult buildSkippedExecutablePlan() {
        return new ExecutablePlanResult(
                "SKIPPED",
                "未配置计划智能体，当前仅生成规则版计划与占位 executable plan。",
                "",
                "",
                "未配置计划智能体，已生成占位 executable plan",
                null,
                false
        );
    }

    private ExecutablePlanResult buildEmptyExecutablePlan() {
        String summary = "规则版计划中没有可供 AI 继续分析的分片，当前直接输出空 executable plan。";
        String markdown = """
                # AI 可执行计划

                ## 概览
                - 摘要：规则版计划中没有可供 AI 继续分析的分片
                - 推荐执行模式：SEQUENTIAL

                ## 说明
                - 当前没有可自动执行分片，建议直接查看扫描报告和人工处理项。
                """;
        try {
            LinkedHashMap<String, Object> payloadJson = new LinkedHashMap<>();
            payloadJson.put("status", "SUCCESS");
            payloadJson.put("summary", summary);
            payloadJson.put("recommendedMode", "SEQUENTIAL");
            payloadJson.put("executionMarkdown", markdown.strip());
            payloadJson.put("shards", List.of());
            payloadJson.put("manualItems", List.of());
            payloadJson.put("notes", List.of("当前没有可自动执行分片。"));
            return new ExecutablePlanResult(
                    "SUCCESS",
                    summary,
                    markdown.strip(),
                    objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(payloadJson),
                    "当前没有可分析分片，已输出空 executable plan",
                    null,
                    false
            );
        } catch (Exception exception) {
            return buildFailedSoftExecutablePlan("汇总空 executable plan 失败：" + resolveMessage(exception));
        }
    }

    private ExecutablePlanResult buildFailedSoftExecutablePlan(String message) {
        return new ExecutablePlanResult(
                "FAILED_SOFT",
                defaultString(message).isBlank() ? "AI executable plan 生成失败，已输出降级占位计划。" : message,
                "",
                "",
                defaultString(message).isBlank() ? "计划智能体生成失败，已输出降级 executable plan" : message,
                null,
                false
        );
    }

    private ExecutablePlanResult buildCanceledExecutablePlan() {
        return new ExecutablePlanResult(
                "CANCELED",
                "执行已取消，已停止 AI executable plan 生成。",
                "",
                "",
                "执行已取消，已停止 AI executable plan 生成",
                null,
                true
        );
    }

    /**
     * 对计划智能体输出做强校验，只接受结构化 JSON，避免后续 code agent 拿到不可执行的自由文本计划。
     */
    private ExecutablePlanResult parseExecutablePlan(String rawOutput,
                                                     ScanTaskPayload payload,
                                                     String fixShardsJson) {
        try {
            JsonNode root = objectMapper.readTree(extractJsonObjectText(rawOutput));
            if (!root.isObject()) {
                throw new IllegalArgumentException("计划智能体未返回 JSON 对象");
            }
            String summary = root.path("summary").asText("").trim();
            String executionMarkdown = root.path("executionMarkdown").asText("").trim();
            String recommendedMode = root.path("recommendedMode").asText("").trim().toUpperCase();
            if (!hasText(summary) || !hasText(executionMarkdown)) {
                throw new IllegalArgumentException("计划智能体返回缺少 summary 或 executionMarkdown");
            }
            if (!"SEQUENTIAL".equals(recommendedMode) && !"PARALLEL".equals(recommendedMode)) {
                throw new IllegalArgumentException("计划智能体返回了不支持的 recommendedMode");
            }
            JsonNode shardsNode = root.path("shards");
            if (!shardsNode.isArray()) {
                throw new IllegalArgumentException("计划智能体返回的 shards 不是数组");
            }

            List<String> availableShardIds = extractShardIds(fixShardsJson);
            List<LinkedHashMap<String, Object>> normalizedShards = new ArrayList<>();
            for (JsonNode shardNode : shardsNode) {
                String shardId = shardNode.path("shardId").asText("").trim();
                if (!hasText(shardId) || !availableShardIds.contains(shardId)) {
                    throw new IllegalArgumentException("计划智能体返回了不存在的 shardId: " + shardId);
                }
                LinkedHashMap<String, Object> normalizedShard = new LinkedHashMap<>();
                normalizedShard.put("shardId", shardId);
                normalizedShard.put("action", shardNode.path("action").asText(""));
                normalizedShard.put("reason", shardNode.path("reason").asText(""));
                normalizedShards.add(normalizedShard);
            }

            LinkedHashMap<String, Object> payloadJson = new LinkedHashMap<>();
            payloadJson.put("status", "SUCCESS");
            payloadJson.put("summary", summary);
            payloadJson.put("recommendedMode", recommendedMode);
            payloadJson.put("executionMarkdown", executionMarkdown);
            payloadJson.put("planAgentId", payload.planAgentId());
            payloadJson.put("planAgentName", payload.planAgentName());
            payloadJson.put("shards", normalizedShards);
            payloadJson.put("manualItems", readFlexibleNode(root.path("manualItems")));
            payloadJson.put("notes", readFlexibleNode(root.path("notes")));
            String jsonText = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(payloadJson);
            return new ExecutablePlanResult(
                    "SUCCESS",
                    summary,
                    executionMarkdown,
                    jsonText,
                    "已生成 AI 可执行计划：模式 " + recommendedMode + "，执行分片 " + normalizedShards.size() + " 个",
                    null,
                    false
            );
        } catch (Exception exception) {
            return buildFailedSoftExecutablePlan("计划智能体输出校验失败：" + limitMessage(resolveMessage(exception)));
        }
    }

    /**
     * 计划智能体偶发会带上代码块围栏或额外说明，这里先尽量抽出 JSON 主体，降低软失败概率。
     */
    private String extractJsonObjectText(String rawOutput) {
        String normalized = defaultString(rawOutput);
        if (!hasText(normalized)) {
            return "{}";
        }
        if (normalized.startsWith("```")) {
            String[] lines = normalized.split("\\R");
            if (lines.length >= 3) {
                normalized = String.join("\n", java.util.Arrays.asList(lines).subList(1, lines.length - 1)).trim();
            }
        }
        int start = normalized.indexOf('{');
        int end = normalized.lastIndexOf('}');
        if (start >= 0 && end > start) {
            return normalized.substring(start, end + 1).trim();
        }
        return normalized;
    }

    private List<String> extractShardIds(String fixShardsJson) {
        List<String> shardIds = new ArrayList<>();
        if (!hasText(fixShardsJson)) {
            return shardIds;
        }
        try {
            JsonNode root = objectMapper.readTree(fixShardsJson);
            for (JsonNode shardNode : root.path("shards")) {
                String shardId = shardNode.path("shardId").asText("").trim();
                if (hasText(shardId)) {
                    shardIds.add(shardId);
                }
            }
        } catch (Exception ignored) {
        }
        return shardIds;
    }

    private Object readFlexibleNode(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return List.of();
        }
        try {
            return objectMapper.convertValue(node, Object.class);
        } catch (IllegalArgumentException ignored) {
            return node.toString();
        }
    }

    private String limitContextSection(String value, int maxLength) {
        if (!hasText(value)) {
            return "";
        }
        String normalized = value.trim();
        return normalized.length() > maxLength ? normalized.substring(0, maxLength) : normalized;
    }

    private String appendExecutablePlanSummary(String summaryText, ExecutablePlanResult executablePlanResult) {
        if (executablePlanResult == null || "SUCCESS".equalsIgnoreCase(executablePlanResult.status()) || executablePlanResult.canceled()) {
            return summaryText;
        }
        if (!hasText(executablePlanResult.summary())) {
            return summaryText;
        }
        if (!hasText(summaryText)) {
            return executablePlanResult.summary();
        }
        return defaultString(summaryText) + "；" + executablePlanResult.summary();
    }

    private ExecutablePlanResult attachExecutablePlanArtifacts(String runKey,
                                                               ExecutionTaskEntity executionTask,
                                                               ExecutionRunEntity executionRun,
                                                               ExecutablePlanResult executablePlanResult) {
        try {
            RepositoryScanClientService.PackageScanResponse packageResponse = repositoryScanClientService.packageExecPlan(
                    new RepositoryScanClientService.PackageScanRequest(
                            runKey,
                            executionTask.getId(),
                            executionRun.getRunNo(),
                            executablePlanResult.markdown(),
                            executablePlanResult.jsonText(),
                            executablePlanResult.status(),
                            executablePlanResult.summary()
                    )
            );
            return new ExecutablePlanResult(
                    executablePlanResult.status(),
                    executablePlanResult.summary(),
                    executablePlanResult.markdown(),
                    executablePlanResult.jsonText(),
                    executablePlanResult.stepOutput(),
                    packageResponse,
                    executablePlanResult.canceled()
            );
        } catch (RuntimeException exception) {
            if (executablePlanResult.canceled()) {
                return executablePlanResult;
            }
            return new ExecutablePlanResult(
                    "FAILED_SOFT",
                    "AI executable plan 上传失败：" + resolveMessage(exception),
                    "",
                    "",
                    "AI executable plan 上传失败：" + resolveMessage(exception),
                    null,
                    false
            );
        }
    }

    private String runPlanAgentWithCancellation(Long executionTaskId,
                                                Long planAgentId,
                                                String input,
                                                Map<String, String> variables,
                                                Long stepId,
                                                int progressStart,
                                                int progressEnd,
                                                String runningMessage) {
        ThreadFactory threadFactory = runnable -> {
            Thread thread = new Thread(runnable, "scan-plan-agent-" + executionTaskId);
            thread.setDaemon(true);
            return thread;
        };
        ExecutorService executorService = Executors.newSingleThreadExecutor(threadFactory);
        Future<String> future = executorService.submit(() -> agentExecutionService.runAgent(planAgentId, input, variables));
        int pollCount = 0;
        try {
            while (true) {
                if (isCancelRequested(executionTaskId)) {
                    future.cancel(true);
                    throw new PlanExecutionCanceledException("执行已取消");
                }
                try {
                    return future.get(1, TimeUnit.SECONDS);
                } catch (TimeoutException ignored) {
                    pollCount += 1;
                    if (stepId != null) {
                        int progressPercent = Math.min(Math.max(progressStart, progressEnd - 1), progressStart + pollCount * 3);
                        updateVisibleExecutablePlanStepProgress(stepId, progressPercent, runningMessage);
                    }
                } catch (CancellationException exception) {
                    throw new PlanExecutionCanceledException("执行已取消", exception);
                } catch (ExecutionException exception) {
                    Throwable cause = exception.getCause();
                    if (cause instanceof RuntimeException runtimeException) {
                        throw runtimeException;
                    }
                    throw new IllegalStateException(resolveMessage(cause), cause);
                }
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            future.cancel(true);
            throw new PlanExecutionCanceledException("执行已取消", exception);
        } finally {
            executorService.shutdownNow();
        }
    }

    private boolean isCancelRequested(Long executionTaskId) {
        Boolean cancelRequested = executionTaskRepository.findCancelRequestedFlagById(executionTaskId);
        return Boolean.TRUE.equals(cancelRequested);
    }

    private int safeNumber(Integer value) {
        return value == null ? 0 : value;
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private String resolveMessage(Throwable exception) {
        if (exception == null || exception.getMessage() == null || exception.getMessage().isBlank()) {
            return "执行失败";
        }
        return exception.getMessage().trim();
    }

    private String defaultString(String value) {
        return value == null ? "" : value;
    }

    private String abbreviate(String value, int maxLength) {
        if (value == null || value.isBlank()) {
            return "";
        }
        String normalized = value.trim();
        return normalized.length() > maxLength ? normalized.substring(0, maxLength) : normalized;
    }

    private String limitMessage(String value) {
        if (!hasText(value)) {
            return "";
        }
        String normalized = value.trim();
        return normalized.length() > 500 ? normalized.substring(0, 500) : normalized;
    }

    private record ScanTaskPayload(Long bindingId,
                                   String branch,
                                   String rulesetCode,
                                   RulesetSnapshot rulesetSnapshot,
                                   Long planAgentId,
                                   String planAgentName,
                                   String projectName) {
    }

    /**
     * 规则快照对象。
     * 用于把任务创建当时选中的规则定义稳定固化到执行链路中。
     */
    private record RulesetSnapshot(String code, String name, String engineType, String definitionContent) {
    }

    private record ResolvedRepositoryContext(
            String repoUrl,
            String apiBaseUrl,
            String projectRef,
            String authToken,
            String repoDisplayName,
            String branch
    ) {
    }

    public record RepositoryScanExecutionResult(String outputSummary, List<ExecutionArtifactEntity> artifacts, boolean canceled) {
    }

    private record ExecutablePlanResult(
            String status,
            String summary,
            String markdown,
            String jsonText,
            String stepOutput,
            RepositoryScanClientService.PackageScanResponse packageResponse,
            boolean canceled
    ) {
    }

    private record ExecutablePlanShard(
            String shardId,
            String title,
            List<String> ruleIds,
            List<String> filePaths,
            List<String> validationCommands,
            int findingCount,
            String rawJson,
            String sourceMarkdown
    ) {
    }

    private record ExecutablePlanShardAnalysis(
            String shardId,
            String title,
            String decision,
            String action,
            String reason,
            List<String> notes,
            List<String> validationCommands,
            int findingCount
    ) {
        private static ExecutablePlanShardAnalysis failedSoft(ExecutablePlanShard shard, String reason) {
            return new ExecutablePlanShardAnalysis(
                    shard.shardId(),
                    shard.title(),
                    "MANUAL",
                    "请人工复核当前分片",
                    reason,
                    List.of("当前分片 AI 分析失败，建议人工补充判断。"),
                    shard.validationCommands(),
                    shard.findingCount()
            );
        }

        private Map<String, Object> toManualItem() {
            LinkedHashMap<String, Object> item = new LinkedHashMap<>();
            item.put("shardId", shardId);
            item.put("title", title);
            item.put("reason", reason);
            return item;
        }
    }

    private record ReportSection(String heading, String content) {
    }

    private static class PlanExecutionCanceledException extends RuntimeException {

        private PlanExecutionCanceledException(String message) {
            super(message);
        }

        private PlanExecutionCanceledException(String message, Throwable cause) {
            super(message, cause);
        }
    }

    public static class RepositoryScanStepException extends RuntimeException {

        private final ExecutionStepEntity failedStep;
        private final List<ExecutionArtifactEntity> artifacts;

        public RepositoryScanStepException(ExecutionStepEntity failedStep, String message, List<ExecutionArtifactEntity> artifacts) {
            super(message);
            this.failedStep = failedStep;
            this.artifacts = artifacts == null ? List.of() : List.copyOf(artifacts);
        }

        public ExecutionStepEntity failedStep() {
            return failedStep;
        }

        public List<ExecutionArtifactEntity> artifacts() {
            return artifacts;
        }
    }
}
