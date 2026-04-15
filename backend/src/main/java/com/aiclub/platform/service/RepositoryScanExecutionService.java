package com.aiclub.platform.service;

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

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.NoSuchElementException;

/**
 * 仓库规范扫描执行服务。
 * 该服务负责把执行中心中的扫描任务转换为 code-processing 的分步调用，并沉淀执行产物。
 */
@Service
public class RepositoryScanExecutionService {

    private static final Logger log = LoggerFactory.getLogger(RepositoryScanExecutionService.class);
    private static final int TOTAL_STEPS = 6;

    private final ProjectGitlabBindingRepository projectGitlabBindingRepository;
    private final ExecutionStepRepository executionStepRepository;
    private final ExecutionRunRepository executionRunRepository;
    private final ExecutionArtifactRepository executionArtifactRepository;
    private final ExecutionTaskRepository executionTaskRepository;
    private final RepositoryScanClientService repositoryScanClientService;
    private final RepositoryScanRulesetService repositoryScanRulesetService;
    private final TokenCipherService tokenCipherService;
    private final GitlabApiService gitlabApiService;
    private final ObjectMapper objectMapper;

    public RepositoryScanExecutionService(ProjectGitlabBindingRepository projectGitlabBindingRepository,
                                          ExecutionStepRepository executionStepRepository,
                                          ExecutionRunRepository executionRunRepository,
                                          ExecutionArtifactRepository executionArtifactRepository,
                                          ExecutionTaskRepository executionTaskRepository,
                                          RepositoryScanClientService repositoryScanClientService,
                                          RepositoryScanRulesetService repositoryScanRulesetService,
                                          TokenCipherService tokenCipherService,
                                          GitlabApiService gitlabApiService,
                                          ObjectMapper objectMapper) {
        this.projectGitlabBindingRepository = projectGitlabBindingRepository;
        this.executionStepRepository = executionStepRepository;
        this.executionRunRepository = executionRunRepository;
        this.executionArtifactRepository = executionArtifactRepository;
        this.executionTaskRepository = executionTaskRepository;
        this.repositoryScanClientService = repositoryScanClientService;
        this.repositoryScanRulesetService = repositoryScanRulesetService;
        this.tokenCipherService = tokenCipherService;
        this.gitlabApiService = gitlabApiService;
        this.objectMapper = objectMapper;
    }

    /**
     * 执行一条仓库规范扫描任务。
     * 扫描步骤失败时需要保留已经写入的步骤状态与日志，因此这里显式禁止对
     * `RepositoryScanStepException` 做事务回滚，避免外层失败摘要再引用不到步骤记录。
     */
    @Transactional(noRollbackFor = RepositoryScanStepException.class)
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
            summarizeReport(executionTask, executionRun, runKey, resolved.repoDisplayName());
            RepositoryScanClientService.PackageScanResponse packaged = publishReport(executionTask, executionRun, runKey);
            saveArtifacts(executionRun, packaged, artifacts);
            String summaryText = hasText(packaged.summaryText())
                    ? packaged.summaryText().trim()
                    : buildFallbackSummary(normalize, prepare);
            executionRun.setOutputSummary(summaryText);
            executionRun.setUpdatedAt(LocalDateTime.now());
            executionRunRepository.save(executionRun);
            return new RepositoryScanExecutionResult(summaryText, artifacts);
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

    private void summarizeReport(ExecutionTaskEntity executionTask,
                                 ExecutionRunEntity executionRun,
                                 String runKey,
                                 String repoDisplayName) {
        ExecutionStepEntity step = beginStep(executionRun, 5, "GENERATE_REPORT_SUMMARY", "生成扫描报告", repoDisplayName);
        try {
            repositoryScanClientService.summarizeScan(runKey, repoDisplayName);
            completeStep(step, "已生成扫描报告摘要");
            updateRunProgress(executionRun, 5);
            updateTaskSummary(executionTask, "执行中：生成扫描报告");
        } catch (RuntimeException exception) {
            throw failStep(step, exception, List.of());
        }
    }

    private RepositoryScanClientService.PackageScanResponse publishReport(ExecutionTaskEntity executionTask,
                                                                          ExecutionRunEntity executionRun,
                                                                          String runKey) {
        ExecutionStepEntity step = beginStep(executionRun, 6, "PUBLISH_REPORT", "发布扫描报告", runKey);
        try {
            RepositoryScanClientService.PackageScanResponse response = repositoryScanClientService.packageScan(
                    new RepositoryScanClientService.PackageScanRequest(runKey, executionTask.getId(), executionRun.getRunNo())
            );
            int artifactCount = response.artifacts() == null ? 0 : response.artifacts().size();
            completeStep(step, "已生成 " + artifactCount + " 个产物");
            updateRunProgress(executionRun, 6);
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
        for (RepositoryScanClientService.PackageArtifactResponse item : packaged.artifacts()) {
            ExecutionArtifactEntity artifact = new ExecutionArtifactEntity();
            artifact.setRun(executionRun);
            artifact.setArtifactType(defaultString(item.artifactType()));
            artifact.setTitle(defaultString(item.title()));
            artifact.setContentRef(defaultString(item.objectKey()));
            artifact.setContentText(defaultString(item.previewText()));
            artifact.setWorkItemWritebackFlag(false);
            artifacts.add(executionArtifactRepository.save(artifact));
        }
    }

    private ExecutionStepEntity beginStep(ExecutionRunEntity executionRun, int stepNo, String stepCode, String stepName, String inputSnapshot) {
        ExecutionStepEntity step = new ExecutionStepEntity();
        step.setRun(executionRun);
        step.setStepNo(stepNo);
        step.setStepCode(stepCode);
        step.setStepName(stepName);
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
                    readRulesetSnapshot(rulesetSnapshotNode)
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

    private int safeNumber(Integer value) {
        return value == null ? 0 : value;
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private String resolveMessage(RuntimeException exception) {
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

    private record ScanTaskPayload(Long bindingId, String branch, String rulesetCode, RulesetSnapshot rulesetSnapshot) {
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

    public record RepositoryScanExecutionResult(String outputSummary, List<ExecutionArtifactEntity> artifacts) {
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
