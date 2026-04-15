package com.aiclub.platform.service;

import com.aiclub.platform.common.DataPermissionScopeType;
import com.aiclub.platform.domain.model.AiModelConfigEntity;
import com.aiclub.platform.domain.model.AgentEntity;
import com.aiclub.platform.domain.model.GitlabAutoMergeConfigEntity;
import com.aiclub.platform.domain.model.GitlabAutoMergeLogEntity;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.ProjectGitlabBindingEntity;
import com.aiclub.platform.domain.model.RepositoryScanRulesetEntity;
import com.aiclub.platform.dto.CodeReviewResult;
import com.aiclub.platform.dto.GitlabAutoMergeConfigSummary;
import com.aiclub.platform.dto.GitlabAutoMergeLogSummary;
import com.aiclub.platform.dto.GitlabAutoMergeRunItem;
import com.aiclub.platform.dto.GitlabAutoMergeRunResult;
import com.aiclub.platform.dto.GitlabBranchSummary;
import com.aiclub.platform.dto.GitlabCreateMergeRequestResult;
import com.aiclub.platform.dto.GitlabMergeRequestSummary;
import com.aiclub.platform.dto.GitlabTagCreateResult;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.ProjectGitlabBindingSummary;
import com.aiclub.platform.dto.RepositoryScanRulesetSummary;
import com.aiclub.platform.dto.ExecutionTaskSummary;
import com.aiclub.platform.dto.request.GitlabAutoMergeConfigRequest;
import com.aiclub.platform.dto.request.GitlabBindingScanTaskRequest;
import com.aiclub.platform.dto.request.CreateExecutionTaskRequest;
import com.aiclub.platform.dto.request.GitlabCreateMergeRequestRequest;
import com.aiclub.platform.dto.request.GitlabTagCreateRequest;
import com.aiclub.platform.dto.request.ProjectGitlabBindingRequest;
import com.aiclub.platform.repository.AiModelConfigRepository;
import com.aiclub.platform.repository.AgentRepository;
import com.aiclub.platform.repository.GitlabAutoMergeConfigRepository;
import com.aiclub.platform.repository.GitlabAutoMergeLogRepository;
import com.aiclub.platform.repository.ProjectGitlabBindingRepository;
import com.aiclub.platform.repository.ProjectRepository;
import jakarta.persistence.criteria.JoinType;
import jakarta.persistence.criteria.Predicate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.scheduling.support.CronExpression;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.NoSuchElementException;

@Service
@Transactional(readOnly = true)
public class GitlabManagementService {

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final String MODE_PROJECT_BOUND = "PROJECT_BOUND";
    private static final String MODE_STANDALONE = "STANDALONE";
    private static final String TRIGGER_MANUAL = "MANUAL";
    private static final String TRIGGER_SCHEDULED = "SCHEDULED";
    private static final String BRANCH_BEHIND_REASON_PREFIX = "源分支落后于目标分支";

    private final ProjectRepository projectRepository;
    private final AgentRepository agentRepository;
    private final ProjectGitlabBindingRepository bindingRepository;
    private final GitlabAutoMergeConfigRepository autoMergeConfigRepository;
    private final GitlabAutoMergeLogRepository autoMergeLogRepository;
    private final AiModelConfigRepository aiModelConfigRepository;
    private final GitlabApiService gitlabApiService;
    private final TokenCipherService tokenCipherService;
    private final ModelConfigService modelConfigService;
    private final CodeReviewClientService codeReviewClientService;
    private final AgentExecutionService agentExecutionService;
    private final CicdManagementService cicdManagementService;
    private final NotificationService notificationService;
    private final ProjectDataPermissionService projectDataPermissionService;
    private final GitlabUserOauthService gitlabUserOauthService;
    private final ExecutionTaskService executionTaskService;
    private final RepositoryScanClientService repositoryScanClientService;
    private final RepositoryScanRulesetService repositoryScanRulesetService;
    private final String defaultApiUrl;

    public GitlabManagementService(ProjectRepository projectRepository,
                                   ProjectGitlabBindingRepository bindingRepository,
                                   GitlabAutoMergeConfigRepository autoMergeConfigRepository,
                                   GitlabAutoMergeLogRepository autoMergeLogRepository,
                                   AiModelConfigRepository aiModelConfigRepository,
                                   AgentRepository agentRepository,
                                   GitlabApiService gitlabApiService,
                                   TokenCipherService tokenCipherService,
                                   ModelConfigService modelConfigService,
                                   CodeReviewClientService codeReviewClientService,
                                   AgentExecutionService agentExecutionService,
                                   CicdManagementService cicdManagementService,
                                   NotificationService notificationService,
                                   ProjectDataPermissionService projectDataPermissionService,
                                   GitlabUserOauthService gitlabUserOauthService,
                                   ExecutionTaskService executionTaskService,
                                   RepositoryScanClientService repositoryScanClientService,
                                   RepositoryScanRulesetService repositoryScanRulesetService,
                                   @Value("${platform.gitlab.default-api-url}") String defaultApiUrl) {
        this.projectRepository = projectRepository;
        this.agentRepository = agentRepository;
        this.bindingRepository = bindingRepository;
        this.autoMergeConfigRepository = autoMergeConfigRepository;
        this.autoMergeLogRepository = autoMergeLogRepository;
        this.aiModelConfigRepository = aiModelConfigRepository;
        this.gitlabApiService = gitlabApiService;
        this.tokenCipherService = tokenCipherService;
        this.modelConfigService = modelConfigService;
        this.codeReviewClientService = codeReviewClientService;
        this.agentExecutionService = agentExecutionService;
        this.cicdManagementService = cicdManagementService;
        this.notificationService = notificationService;
        this.projectDataPermissionService = projectDataPermissionService;
        this.gitlabUserOauthService = gitlabUserOauthService;
        this.executionTaskService = executionTaskService;
        this.repositoryScanClientService = repositoryScanClientService;
        this.repositoryScanRulesetService = repositoryScanRulesetService;
        this.defaultApiUrl = defaultApiUrl;
    }

    public PageResponse<ProjectGitlabBindingSummary> pageBindings(int page, int size, String keyword, Long projectId) {
        ProjectDataPermissionService.ProjectDataScope scope = projectDataPermissionService.requireCurrentScope();
        if (projectId != null) {
            requireProject(projectId);
        }
        Pageable pageable = buildPageable(page, size, Sort.by(Sort.Direction.ASC, "id"));
        Page<ProjectGitlabBindingSummary> pageData = bindingRepository.findAll(bindingSpecification(keyword, projectId, scope), pageable)
                .map(this::toBindingSummary);
        return PageResponse.from(pageData);
    }

    public List<ProjectGitlabBindingSummary> listBindingOptions() {
        ProjectDataPermissionService.ProjectDataScope scope = projectDataPermissionService.requireCurrentScope();
        return bindingRepository.findAll(bindingSpecification(null, null, scope), Sort.by(Sort.Direction.ASC, "id")).stream()
                .map(this::toBindingSummary)
                .toList();
    }

    @Transactional
    public ProjectGitlabBindingSummary createBinding(ProjectGitlabBindingRequest request) {
        ProjectEntity project = requireProject(request.projectId());
        String apiBaseUrl = resolveApiBaseUrl(request.apiBaseUrl());
        String projectRef = requireProjectRef(request.gitlabProjectRef());
        validateBindingUniqueness(project.getId(), apiBaseUrl, projectRef, null);
        ProjectGitlabBindingEntity entity = new ProjectGitlabBindingEntity();
        entity.setProject(project);
        entity.setApiBaseUrl(apiBaseUrl);
        entity.setGitlabProjectRef(projectRef);
        entity.setDefaultTargetBranch(trimToNull(request.defaultTargetBranch()));
        entity.setTokenCiphertext(tokenCipherService.encrypt(requireToken(request.apiToken())));
        entity.setEnabled(defaultBoolean(request.enabled(), true));
        return toBindingSummary(bindingRepository.save(entity));
    }

    @Transactional
    public ProjectGitlabBindingSummary updateBinding(Long id, ProjectGitlabBindingRequest request) {
        ProjectGitlabBindingEntity entity = requireBinding(id);
        ProjectEntity project = requireProject(request.projectId());
        String apiBaseUrl = resolveApiBaseUrl(request.apiBaseUrl());
        String projectRef = requireProjectRef(request.gitlabProjectRef());
        validateBindingUniqueness(project.getId(), apiBaseUrl, projectRef, id);
        entity.setProject(project);
        entity.setApiBaseUrl(apiBaseUrl);
        entity.setGitlabProjectRef(projectRef);
        entity.setDefaultTargetBranch(trimToNull(request.defaultTargetBranch()));
        entity.setEnabled(defaultBoolean(request.enabled(), true));
        if (hasText(request.apiToken())) {
            entity.setTokenCiphertext(tokenCipherService.encrypt(request.apiToken().trim()));
        }
        return toBindingSummary(bindingRepository.save(entity));
    }

    @Transactional
    public void deleteBinding(Long id) {
        ProjectGitlabBindingEntity binding = requireBinding(id);
        autoMergeConfigRepository.deleteAllByBinding_Id(binding.getId());
        bindingRepository.delete(binding);
    }

    @Transactional(noRollbackFor = RuntimeException.class)
    public ProjectGitlabBindingSummary testBinding(Long id) {
        ProjectGitlabBindingEntity entity = requireBinding(id);
        try {
            String token = tokenCipherService.decrypt(entity.getTokenCiphertext());
            GitlabApiService.GitlabUser user = gitlabApiService.fetchCurrentUser(entity.getApiBaseUrl(), token);
            GitlabApiService.GitlabProject project = gitlabApiService.fetchProject(entity.getApiBaseUrl(), token, entity.getGitlabProjectRef());
            entity.setGitlabProjectId(project.id());
            entity.setGitlabProjectName(project.name());
            entity.setGitlabProjectPath(project.pathWithNamespace());
            entity.setGitlabProjectWebUrl(project.webUrl());
            entity.setGitlabHttpCloneUrl(trimToNull(project.httpCloneUrl()));
            entity.setGitlabSshCloneUrl(trimToNull(project.sshCloneUrl()));
            if (!hasText(entity.getDefaultTargetBranch()) && hasText(project.defaultBranch())) {
                entity.setDefaultTargetBranch(project.defaultBranch());
            }
            entity.setLastTestStatus("SUCCESS");
            entity.setLastTestMessage("连接成功");
            entity.setLastTestedAt(LocalDateTime.now());
            return toBindingSummary(bindingRepository.save(entity));
        } catch (RuntimeException exception) {
            entity.setLastTestStatus("FAILED");
            entity.setLastTestMessage(limitMessage(exception.getMessage()));
            entity.setLastTestedAt(LocalDateTime.now());
            bindingRepository.save(entity);
            throw exception;
        }
    }

    public List<GitlabMergeRequestSummary> previewBindingMergeRequests(Long id, String targetBranch) {
        ProjectGitlabBindingEntity entity = requireBinding(id);
        String token = tokenCipherService.decrypt(entity.getTokenCiphertext());
        String projectRef = resolveBindingProjectRef(entity);
        return gitlabApiService.listMergeRequests(entity.getApiBaseUrl(), token, projectRef, "opened", hasText(targetBranch) ? targetBranch.trim() : entity.getDefaultTargetBranch())
                .stream()
                .map(item -> gitlabApiService.fetchMergeRequest(entity.getApiBaseUrl(), token, projectRef, item.iid()))
                .map(this::toMergeRequestSummary)
                .toList();
    }

    /**
     * 返回仓库规范扫描规则集列表，供仓库页和 Hermes 工具统一复用。
     */
    public List<RepositoryScanRulesetSummary> listScanRulesets() {
        return repositoryScanRulesetService.listEnabledRulesets();
    }

    /**
     * 基于 GitLab 绑定创建一条仓库规范扫描任务。
     */
    @Transactional
    public ExecutionTaskSummary createBindingScanTask(Long bindingId, GitlabBindingScanTaskRequest request) {
        ProjectGitlabBindingEntity binding = requireBinding(bindingId);
        String branch = trimToNull(request.branch());
        if (branch == null) {
            branch = hasText(binding.getDefaultTargetBranch()) ? binding.getDefaultTargetBranch().trim() : "main";
        }
        RepositoryScanRulesetEntity ruleset = resolveScanRuleset(request.rulesetCode());
        AgentEntity planAgent = resolveRepositoryScanPlanAgent(request.planAgentId());
        CreateExecutionTaskRequest taskRequest = new CreateExecutionTaskRequest(
                ExecutionWorkflowService.SCENARIO_CODEBASE_COMPLIANCE_SCAN,
                binding.getProject().getId(),
                null,
                buildScanTaskTitle(binding, branch),
                "GITLAB_BINDING_SCAN",
                List.of(),
                buildScanInputPayload(binding, branch, ruleset, planAgent)
        );
        return executionTaskService.createExecutionTask(taskRequest);
    }

    /**
     * 查询绑定仓库的分支列表，供前端远程搜索选择。
     */
    public List<GitlabBranchSummary> listBindingBranches(Long id, String search) {
        ProjectGitlabBindingEntity entity = requireBinding(id);
        ResolvedGitlabConfig resolved = resolveBindingConfig(entity);
        return gitlabApiService.listBranches(resolved.apiBaseUrl(), resolved.token(), resolved.projectRef(), search)
                .stream()
                .map(branch -> toBranchSummary(entity, branch))
                .toList();
    }

    /**
     * 在指定绑定仓库上创建新的 GitLab Tag。
     */
    @Transactional
    public GitlabTagCreateResult createBindingTag(Long id, GitlabTagCreateRequest request) {
        ProjectGitlabBindingEntity entity = requireBinding(id);
        ResolvedGitlabConfig resolved = resolveBindingConfig(entity);
        String tagName = requireValue(request.tagName(), "Tag 名称");
        String branchName = requireValue(request.branchName(), "来源分支");
        String message = trimToNull(request.message());

        GitlabApiService.GitlabTag tag = gitlabApiService.createTag(
                resolved.apiBaseUrl(),
                resolved.token(),
                resolved.projectRef(),
                tagName,
                branchName,
                message
        );
        return toTagCreateResult(entity, resolved.projectRef(), branchName, tag);
    }

    /**
     * 基于指定绑定仓库快速发起 Merge Request。
     */
    @Transactional
    public GitlabCreateMergeRequestResult createBindingMergeRequest(Long id, GitlabCreateMergeRequestRequest request) {
        ProjectGitlabBindingEntity entity = requireBinding(id);
        String sourceBranch = requireValue(request.sourceBranch(), "源分支");
        String targetBranch = requireValue(request.targetBranch(), "目标分支");
        requireDifferentBranches(sourceBranch, targetBranch);
        String title = requireValue(request.title(), "MR 标题");
        String description = trimToNull(request.description());
        GitlabUserOauthService.CurrentGitlabOauthAccess oauthAccess = gitlabUserOauthService.requireCurrentUserAccess(entity.getApiBaseUrl());
        String projectRef = resolveBindingProjectRef(entity);

        // 快速发起 MR 必须以当前登录用户的 GitLab 身份执行，避免再回退到项目级 token 冒充发起人。
        GitlabApiService.GitlabCreatedMergeRequest mergeRequest = gitlabApiService.createMergeRequest(
                entity.getApiBaseUrl(),
                oauthAccess.authorization(),
                projectRef,
                sourceBranch,
                targetBranch,
                title,
                description
        );
        return new GitlabCreateMergeRequestResult(
                entity.getProject().getName(),
                projectRef,
                mergeRequest.iid(),
                mergeRequest.title(),
                mergeRequest.sourceBranch(),
                mergeRequest.targetBranch(),
                mergeRequest.state(),
                mergeRequest.webUrl(),
                hasText(mergeRequest.createdAt()) ? mergeRequest.createdAt() : formatTime(LocalDateTime.now()),
                oauthAccess.gitlabName(),
                oauthAccess.gitlabUsername()
        );
    }

    public PageResponse<GitlabAutoMergeConfigSummary> pageAutoMergeConfigs(int page, int size, String keyword, String executionMode, Boolean enabled) {
        ProjectDataPermissionService.ProjectDataScope scope = projectDataPermissionService.requireCurrentScope();
        Pageable pageable = buildPageable(page, size, Sort.by(Sort.Direction.ASC, "id"));
        Page<GitlabAutoMergeConfigSummary> pageData = autoMergeConfigRepository.findAll(autoMergeSpecification(keyword, executionMode, enabled, scope), pageable)
                .map(this::toAutoMergeSummary);
        return PageResponse.from(pageData);
    }

    public PageResponse<GitlabAutoMergeLogSummary> pageAutoMergeLogs(int page, int size, Long configId, String result, String triggerType) {
        ProjectDataPermissionService.ProjectDataScope scope = projectDataPermissionService.requireCurrentScope();
        if (configId != null) {
            requireAutoMergeConfig(configId);
        }
        Pageable pageable = buildPageable(page, size, Sort.by(Sort.Direction.DESC, "executedAt", "id"));
        Page<GitlabAutoMergeLogSummary> pageData = autoMergeLogRepository.findAll(autoMergeLogSpecification(configId, result, triggerType, null, scope), pageable)
                .map(this::toAutoMergeLogSummary);
        return PageResponse.from(pageData);
    }

    public List<GitlabAutoMergeLogSummary> listLogsByMergeRequestAuthorUsername(String gitlabUsername, int limit) {
        ProjectDataPermissionService.ProjectDataScope scope = projectDataPermissionService.requireCurrentScope();
        String normalizedUsername = trimToNull(gitlabUsername);
        if (normalizedUsername == null) {
            return List.of();
        }
        Pageable pageable = PageRequest.of(0, Math.max(1, Math.min(limit, 50)), Sort.by(Sort.Direction.DESC, "executedAt", "id"));
        return autoMergeLogRepository.findAll(autoMergeLogSpecification(null, null, null, normalizedUsername, scope), pageable)
                .getContent().stream()
                .map(this::toAutoMergeLogSummary)
                .toList();
    }

    @Transactional
    public GitlabAutoMergeConfigSummary createAutoMergeConfig(GitlabAutoMergeConfigRequest request) {
        GitlabAutoMergeConfigEntity entity = new GitlabAutoMergeConfigEntity();
        fillAutoMergeEntity(entity, request, true);
        return toAutoMergeSummary(autoMergeConfigRepository.save(entity));
    }

    @Transactional
    public GitlabAutoMergeConfigSummary updateAutoMergeConfig(Long id, GitlabAutoMergeConfigRequest request) {
        GitlabAutoMergeConfigEntity entity = requireAutoMergeConfig(id);
        fillAutoMergeEntity(entity, request, false);
        return toAutoMergeSummary(autoMergeConfigRepository.save(entity));
    }

    @Transactional
    public void deleteAutoMergeConfig(Long id) {
        autoMergeConfigRepository.delete(requireAutoMergeConfig(id));
    }

    public GitlabAutoMergeConfigSummary testAutoMergeConfig(Long id) {
        GitlabAutoMergeConfigEntity entity = requireAutoMergeConfig(id);
        ResolvedGitlabConfig resolved = resolveConfig(entity);
        gitlabApiService.fetchCurrentUser(resolved.apiBaseUrl(), resolved.token());
        gitlabApiService.fetchProject(resolved.apiBaseUrl(), resolved.token(), resolved.projectRef());
        return toAutoMergeSummary(entity);
    }

    public List<GitlabMergeRequestSummary> previewAutoMergeConfigMergeRequests(Long id) {
        GitlabAutoMergeConfigEntity entity = requireAutoMergeConfig(id);
        ResolvedGitlabConfig resolved = resolveConfig(entity);
        return gitlabApiService.listMergeRequests(resolved.apiBaseUrl(), resolved.token(), resolved.projectRef(), "opened", resolved.targetBranch())
                .stream()
                .filter(item -> matchesConfig(item, entity))
                .map(item -> gitlabApiService.fetchMergeRequest(resolved.apiBaseUrl(), resolved.token(), resolved.projectRef(), item.iid()))
                .map(this::toMergeRequestSummary)
                .toList();
    }

    @Transactional(noRollbackFor = RuntimeException.class)
    public GitlabAutoMergeRunResult runAutoMergeConfig(Long id) {
        return runAutoMergeConfig(id, TRIGGER_MANUAL);
    }

    @Transactional(noRollbackFor = RuntimeException.class)
    public void runEnabledAutoMergeConfigs() {
        LocalDateTime now = LocalDateTime.now().truncatedTo(ChronoUnit.SECONDS);
        for (GitlabAutoMergeConfigEntity config : autoMergeConfigRepository.findAllByEnabledTrueOrderByIdAsc()) {
            if (!shouldRunScheduled(config, now)) {
                continue;
            }
            try {
                runAutoMergeConfig(config.getId(), TRIGGER_SCHEDULED);
                config.setLastScheduledAt(now);
                autoMergeConfigRepository.save(config);
            } catch (RuntimeException ignored) {
                config.setLastScheduledAt(now);
                autoMergeConfigRepository.save(config);
            }
        }
    }

    private GitlabAutoMergeRunResult runAutoMergeConfig(Long id, String triggerType) {
        GitlabAutoMergeConfigEntity entity = requireAutoMergeConfig(id);
        LocalDateTime executedAt = LocalDateTime.now();
        try {
            if (!Boolean.TRUE.equals(entity.getEnabled())) {
                throw new IllegalArgumentException("自动合并策略未启用");
            }
            ResolvedGitlabConfig resolved = resolveConfig(entity);
            List<GitlabApiService.GitlabMergeRequest> mergeRequests = gitlabApiService
                    .listMergeRequests(resolved.apiBaseUrl(), resolved.token(), resolved.projectRef(), "opened", resolved.targetBranch())
                    .stream().filter(item -> matchesConfig(item, entity)).toList();
            if (mergeRequests.isEmpty()) {
                String emptyMessage = "未匹配到可执行的开放 Merge Request";
                saveAutoMergeLog(entity, triggerType, (Long) null, null, "EMPTY", emptyMessage, null, executedAt);
                updateRunState(entity, "EMPTY", emptyMessage, executedAt);
                return new GitlabAutoMergeRunResult(entity.getId(), entity.getName(), 0, 0, 0, List.of());
            }
            List<GitlabAutoMergeRunItem> items = new ArrayList<>();
            int mergedCount = 0;
            int nonMergedCount = 0;
            for (GitlabApiService.GitlabMergeRequest mergeRequest : mergeRequests) {
                try {
                    GitlabApiService.GitlabMergeRequest latestMergeRequest = gitlabApiService.fetchMergeRequest(
                            resolved.apiBaseUrl(),
                            resolved.token(),
                            resolved.projectRef(),
                            mergeRequest.iid()
                    );
                    if (Boolean.TRUE.equals(latestMergeRequest.draft())) {
                        nonMergedCount++;
                        String reason = "Draft MR \u4e0d\u53c2\u4e0e\u81ea\u52a8\u5408\u5e76";
                        items.add(new GitlabAutoMergeRunItem(latestMergeRequest.iid(), latestMergeRequest.title(), "SKIPPED", reason, latestMergeRequest.webUrl()));
                        saveAutoMergeLog(entity, triggerType, latestMergeRequest, "SKIPPED", reason, latestMergeRequest.webUrl(), buildMergeRequestStatusMarkdown(latestMergeRequest), executedAt);
                        continue;
                    }
                    if (Boolean.TRUE.equals(latestMergeRequest.hasConflicts())) {
                        nonMergedCount++;
                        String reason = "\u5b58\u5728\u51b2\u7a81\uff0c\u65e0\u6cd5\u81ea\u52a8\u5408\u5e76";
                        items.add(new GitlabAutoMergeRunItem(latestMergeRequest.iid(), latestMergeRequest.title(), "SKIPPED", reason, latestMergeRequest.webUrl()));
                        saveAutoMergeLog(entity, triggerType, latestMergeRequest, "SKIPPED", reason, latestMergeRequest.webUrl(), buildMergeRequestStatusMarkdown(latestMergeRequest), executedAt);
                        continue;
                    }
                    if (isSourceBranchBehindTarget(latestMergeRequest)) {
                        nonMergedCount++;
                        String reason = buildSourceBranchBehindReason(latestMergeRequest);
                        items.add(new GitlabAutoMergeRunItem(latestMergeRequest.iid(), latestMergeRequest.title(), "SKIPPED", reason, latestMergeRequest.webUrl()));
                        saveAutoMergeLog(entity, triggerType, latestMergeRequest, "SKIPPED", reason, latestMergeRequest.webUrl(), buildMergeRequestStatusMarkdown(latestMergeRequest), executedAt);
                        continue;
                    }
                    if (Boolean.TRUE.equals(entity.getRequirePipelineSuccess()) && hasText(latestMergeRequest.pipelineStatus()) && !"success".equalsIgnoreCase(latestMergeRequest.pipelineStatus())) {
                        nonMergedCount++;
                        String reason = "Pipeline 状态不满足自动合并要求: " + latestMergeRequest.pipelineStatus();
                        items.add(new GitlabAutoMergeRunItem(latestMergeRequest.iid(), latestMergeRequest.title(), "SKIPPED", reason, latestMergeRequest.webUrl()));
                        saveAutoMergeLog(entity, triggerType, latestMergeRequest, "SKIPPED", reason, latestMergeRequest.webUrl(), buildMergeRequestStatusMarkdown(latestMergeRequest), executedAt);
                        continue;
                    }
                    if (Boolean.TRUE.equals(entity.getAiReviewEnabled())) {
                        CodeReviewResult reviewResult = reviewMergeRequest(entity, resolved, latestMergeRequest);
                        if (!reviewResult.approved()) {
                            nonMergedCount++;
                            String reason = buildReviewFailureMessage(reviewResult);
                            String detailMarkdown = buildReviewExtraMarkdown(reviewResult);
                            items.add(new GitlabAutoMergeRunItem(latestMergeRequest.iid(), latestMergeRequest.title(), "AI_REJECTED", reason, latestMergeRequest.webUrl()));
                            saveAutoMergeLog(entity, triggerType, latestMergeRequest, "AI_REJECTED", reason, latestMergeRequest.webUrl(), detailMarkdown, executedAt);
                            continue;
                        }
                    }
                    GitlabApiService.GitlabMergeResult result = gitlabApiService.acceptMergeRequest(resolved.apiBaseUrl(), resolved.token(), resolved.projectRef(), latestMergeRequest.iid(), defaultBoolean(entity.getAutoMerge(), true), defaultBoolean(entity.getSquashOnMerge(), false), defaultBoolean(entity.getRemoveSourceBranch(), true));
                    mergedCount++;
                    String baseMessage = buildMergeMessage(result);
                    String webUrl = hasText(result.webUrl()) ? result.webUrl() : latestMergeRequest.webUrl();
                    String extraMarkdown = null;
                    String message = baseMessage;
                    if (Boolean.TRUE.equals(entity.getTriggerPipelineAfterMerge())
                            && MODE_PROJECT_BOUND.equals(entity.getExecutionMode())
                            && entity.getBinding() != null
                            && entity.getBinding().getProject() != null) {
                        CicdManagementService.PipelineTriggerOutcome pipelineOutcome = cicdManagementService.tryTriggerProjectPipeline(
                                entity.getBinding().getProject().getId(),
                                latestMergeRequest.targetBranch(),
                                "GitLab 自动合并"
                        );
                        message = buildMergedWithPipelineMessage(baseMessage, pipelineOutcome);
                        extraMarkdown = buildPipelineTriggerMarkdown(pipelineOutcome);
                    }
                    items.add(new GitlabAutoMergeRunItem(latestMergeRequest.iid(), latestMergeRequest.title(), "MERGED", message, webUrl));
                    saveAutoMergeLog(entity, triggerType, latestMergeRequest, "MERGED", message, webUrl, extraMarkdown, executedAt);
                } catch (RuntimeException exception) {
                    nonMergedCount++;
                    String fullReason = defaultString(exception.getMessage());
                    String reason = limitMessage(fullReason);
                    items.add(new GitlabAutoMergeRunItem(mergeRequest.iid(), mergeRequest.title(), "FAILED", reason, mergeRequest.webUrl()));
                    saveAutoMergeLog(entity, triggerType, mergeRequest, "FAILED", reason, mergeRequest.webUrl(), buildExceptionExtraMarkdown(fullReason), executedAt);
                }
            }
            String status = mergedCount > 0 ? (nonMergedCount > 0 ? "PARTIAL" : "SUCCESS") : "SKIPPED";
            String message = "匹配 " + mergeRequests.size() + " 个 MR，成功合并 " + mergedCount + " 个，未合并 " + nonMergedCount + " 个";
            updateRunState(entity, status, message, executedAt);
            return new GitlabAutoMergeRunResult(entity.getId(), entity.getName(), mergeRequests.size(), mergedCount, nonMergedCount, items);
        } catch (RuntimeException exception) {
            String fullReason = defaultString(exception.getMessage());
            String reason = limitMessage(fullReason);
            updateRunState(entity, "FAILED", reason, executedAt);
            saveAutoMergeLog(entity, triggerType, (Long) null, null, "FAILED", reason, null, buildExceptionExtraMarkdown(fullReason), executedAt);
            throw exception;
        }
    }

    private void fillAutoMergeEntity(GitlabAutoMergeConfigEntity entity, GitlabAutoMergeConfigRequest request, boolean createMode) {
        String executionMode = normalizeExecutionMode(request.executionMode());
        entity.setName(request.name().trim());
        entity.setExecutionMode(executionMode);
        entity.setDescription(defaultString(request.description()));
        entity.setSourceBranch(trimToNull(request.sourceBranch()));
        entity.setTargetBranch(trimToNull(request.targetBranch()));
        entity.setTitleKeyword(trimToNull(request.titleKeyword()));
        entity.setEnabled(defaultBoolean(request.enabled(), true));
        entity.setAutoMerge(defaultBoolean(request.autoMerge(), true));
        entity.setSquashOnMerge(defaultBoolean(request.squashOnMerge(), false));
        entity.setRemoveSourceBranch(defaultBoolean(request.removeSourceBranch(), true));
        entity.setTriggerPipelineAfterMerge(defaultBoolean(request.triggerPipelineAfterMerge(), false));
        entity.setRequirePipelineSuccess(defaultBoolean(request.requirePipelineSuccess(), true));
        entity.setSchedulerEnabled(defaultBoolean(request.schedulerEnabled(), false));
        entity.setSchedulerCron(normalizeSchedulerCron(request.schedulerCron()));
        entity.setAiReviewEnabled(defaultBoolean(request.aiReviewEnabled(), false));
        entity.setAiReviewPrompt(defaultString(request.aiReviewPrompt()));
        entity.setReviewAgent(request.reviewAgentId() == null ? null : requireAgent(request.reviewAgentId()));
        entity.setAiModelConfig(request.aiModelConfigId() == null ? null : requireAiModelConfig(request.aiModelConfigId()));
        if (Boolean.TRUE.equals(entity.getSchedulerEnabled()) && !hasText(entity.getSchedulerCron())) {
            throw new IllegalArgumentException("????????? Cron ???");
        }
        if (Boolean.TRUE.equals(entity.getAiReviewEnabled())) {
            if (entity.getReviewAgent() != null) {
                agentExecutionService.validateCodeReviewAgent(entity.getReviewAgent().getId());
            } else if (entity.getAiModelConfig() == null) {
                throw new IllegalArgumentException("?? AI ??????? Code Review Agent");
            }
        }
        if (MODE_PROJECT_BOUND.equals(executionMode)) {
            if (request.bindingId() == null) {
                throw new IllegalArgumentException("???????????? GitLab ??");
            }
            ProjectGitlabBindingEntity binding = requireBinding(request.bindingId());
            entity.setBinding(binding);
            entity.setApiBaseUrl(null);
            entity.setGitlabProjectRef(null);
            entity.setTokenCiphertext(null);
        } else {
            if (Boolean.TRUE.equals(entity.getTriggerPipelineAfterMerge())) {
                throw new IllegalArgumentException("?????????????????? Jenkins ???");
            }
            entity.setBinding(null);
            entity.setApiBaseUrl(resolveApiBaseUrl(request.apiBaseUrl()));
            entity.setGitlabProjectRef(requireProjectRef(request.gitlabProjectRef()));
            if (createMode) {
                entity.setTokenCiphertext(tokenCipherService.encrypt(requireToken(request.apiToken())));
            } else if (hasText(request.apiToken())) {
                entity.setTokenCiphertext(tokenCipherService.encrypt(request.apiToken().trim()));
            } else if (!hasText(entity.getTokenCiphertext())) {
                throw new IllegalArgumentException("?????????? APIToken");
            }
        }
    }


    private boolean matchesConfig(GitlabApiService.GitlabMergeRequest mergeRequest, GitlabAutoMergeConfigEntity entity) {
        if (hasText(entity.getSourceBranch()) && !entity.getSourceBranch().trim().equalsIgnoreCase(mergeRequest.sourceBranch())) {
            return false;
        }
        String effectiveTargetBranch = effectiveTargetBranch(entity);
        if (hasText(effectiveTargetBranch) && !effectiveTargetBranch.equalsIgnoreCase(mergeRequest.targetBranch())) {
            return false;
        }
        return !hasText(entity.getTitleKeyword()) || mergeRequest.title().toLowerCase().contains(entity.getTitleKeyword().trim().toLowerCase());
    }

    private String effectiveTargetBranch(GitlabAutoMergeConfigEntity entity) {
        if (hasText(entity.getTargetBranch())) {
            return entity.getTargetBranch().trim();
        }
        if (entity.getBinding() != null && hasText(entity.getBinding().getDefaultTargetBranch())) {
            return entity.getBinding().getDefaultTargetBranch().trim();
        }
        return null;
    }

    /**
     * 将绑定仓库统一解析为可直接访问 GitLab API 的上下文。
     */
    private ResolvedGitlabConfig resolveBindingConfig(ProjectGitlabBindingEntity entity) {
        return new ResolvedGitlabConfig(
                entity.getApiBaseUrl(),
                tokenCipherService.decrypt(entity.getTokenCiphertext()),
                resolveBindingProjectRef(entity),
                trimToNull(entity.getDefaultTargetBranch())
        );
    }

    private ResolvedGitlabConfig resolveConfig(GitlabAutoMergeConfigEntity entity) {
        if (MODE_PROJECT_BOUND.equals(entity.getExecutionMode())) {
            ProjectGitlabBindingEntity binding = entity.getBinding();
            if (binding == null) {
                throw new IllegalArgumentException("当前策略未关联 GitLab 绑定");
            }
            return new ResolvedGitlabConfig(binding.getApiBaseUrl(), tokenCipherService.decrypt(binding.getTokenCiphertext()), resolveBindingProjectRef(binding), effectiveTargetBranch(entity));
        }
        return new ResolvedGitlabConfig(entity.getApiBaseUrl(), tokenCipherService.decrypt(entity.getTokenCiphertext()), entity.getGitlabProjectRef(), effectiveTargetBranch(entity));
    }

    private String resolveBindingProjectRef(ProjectGitlabBindingEntity entity) {
        if (hasText(entity.getGitlabProjectPath())) {
            return entity.getGitlabProjectPath();
        }
        if (hasText(entity.getGitlabProjectId())) {
            return entity.getGitlabProjectId();
        }
        return entity.getGitlabProjectRef();
    }

    private CodeReviewResult reviewMergeRequest(GitlabAutoMergeConfigEntity entity, ResolvedGitlabConfig resolved, GitlabApiService.GitlabMergeRequest mergeRequest) {
        GitlabApiService.GitlabMergeRequestChanges changes = gitlabApiService.fetchMergeRequestChanges(
                resolved.apiBaseUrl(), resolved.token(), resolved.projectRef(), mergeRequest.iid());
        if (entity.getReviewAgent() != null) {
            return agentExecutionService.reviewMergeRequest(entity.getReviewAgent().getId(), mergeRequest, changes);
        }
        if (entity.getAiModelConfig() == null) {
            throw new IllegalArgumentException("AI ????? Code Review Agent");
        }
        ModelConfigService.ResolvedModelConfig modelConfig = modelConfigService.resolveModelConfig(entity.getAiModelConfig().getId());
        return codeReviewClientService.reviewMergeRequest(modelConfig, buildReviewPrompt(entity), mergeRequest, changes);
    }


    private String buildReviewPrompt(GitlabAutoMergeConfigEntity entity) {
        if (hasText(entity.getAiReviewPrompt())) {
            return entity.getAiReviewPrompt().trim();
        }
        return """
                你是资深代码审查助手，请根据 Merge Request 的变更内容判断是否允许自动合并。
                审核重点：
                1. 是否存在明显 bug 风险、空指针、边界条件遗漏；
                2. 是否存在安全问题，例如敏感信息泄露、鉴权缺失、SQL/命令注入风险；
                3. 是否破坏接口兼容性或关键业务流程；
                4. 是否存在明显低质量实现，例如调试代码、错误处理缺失、硬编码。

                请仅返回 JSON，格式如下：
                {"approved": true/false, "summary": "...", "issues": ["..."]}

                如果存在高风险问题，approved 必须为 false。
                """;
    }

    private String buildReviewFailureMessage(CodeReviewResult reviewResult) {
        String summary = hasText(reviewResult.summary()) ? reviewResult.summary() : "AI Review \u672a\u901a\u8fc7";
        if (reviewResult.issues() == null || reviewResult.issues().isEmpty()) {
            return limitMessage(summary);
        }
        return limitMessage(summary + "\uff08" + reviewResult.issues().size() + " \u9879\u5f85\u5904\u7406\u95ee\u9898\uff09");
    }

    private void updateRunState(GitlabAutoMergeConfigEntity entity, String status, String message, LocalDateTime executedAt) {
        entity.setLastRunStatus(status);
        entity.setLastRunMessage(limitMessage(message));
        entity.setLastRunAt(executedAt);
        autoMergeConfigRepository.save(entity);
    }

    private void saveAutoMergeLog(GitlabAutoMergeConfigEntity config, String triggerType, Long mergeRequestIid, String mergeRequestTitle, String result, String reason, String webUrl, LocalDateTime executedAt) {
        saveAutoMergeLog(config, triggerType, mergeRequestIid, mergeRequestTitle, result, reason, webUrl, null, executedAt);
    }

    private void saveAutoMergeLog(GitlabAutoMergeConfigEntity config, String triggerType, GitlabApiService.GitlabMergeRequest mergeRequest, String result, String reason, String webUrl, LocalDateTime executedAt) {
        saveAutoMergeLog(config, triggerType, mergeRequest, result, reason, webUrl, null, executedAt);
    }

    private void saveAutoMergeLog(GitlabAutoMergeConfigEntity config,
                                  String triggerType,
                                  GitlabApiService.GitlabMergeRequest mergeRequest,
                                  String result,
                                  String reason,
                                  String webUrl,
                                  String extraMarkdown,
                                  LocalDateTime executedAt) {
        saveAutoMergeLog(
                config,
                triggerType,
                mergeRequest == null ? null : mergeRequest.iid(),
                mergeRequest == null ? null : mergeRequest.title(),
                mergeRequest == null ? null : mergeRequest.authorName(),
                mergeRequest == null ? null : mergeRequest.authorUsername(),
                result,
                reason,
                webUrl,
                extraMarkdown,
                executedAt
        );
    }

    private void saveAutoMergeLog(GitlabAutoMergeConfigEntity config, String triggerType, Long mergeRequestIid, String mergeRequestTitle, String result, String reason, String webUrl, String extraMarkdown, LocalDateTime executedAt) {
        saveAutoMergeLog(config, triggerType, mergeRequestIid, mergeRequestTitle, null, null, result, reason, webUrl, extraMarkdown, executedAt);
    }

    private void saveAutoMergeLog(GitlabAutoMergeConfigEntity config,
                                  String triggerType,
                                  Long mergeRequestIid,
                                  String mergeRequestTitle,
                                  String mergeRequestAuthorName,
                                  String mergeRequestAuthorUsername,
                                  String result,
                                  String reason,
                                  String webUrl,
                                  String extraMarkdown,
                                  LocalDateTime executedAt) {
        GitlabAutoMergeLogEntity log = new GitlabAutoMergeLogEntity();
        log.setConfig(config);
        log.setProject(resolveConfigProject(config));
        log.setConfigName(config.getName());
        log.setTriggerType(normalizeTriggerType(triggerType));
        log.setMergeRequestIid(mergeRequestIid);
        log.setMergeRequestTitle(trimToNull(mergeRequestTitle));
        log.setMergeRequestAuthorName(trimToNull(mergeRequestAuthorName));
        log.setMergeRequestAuthorUsername(trimToNull(mergeRequestAuthorUsername));
        log.setResult(result);
        log.setReason(limitMessage(reason));
        log.setDetailMarkdown(limitDetailMarkdown(buildLogDetailMarkdown(config, triggerType, mergeRequestIid, mergeRequestTitle, result, reason, webUrl, executedAt, extraMarkdown)));
        log.setWebUrl(trimToNull(webUrl));
        log.setExecutedAt(executedAt == null ? LocalDateTime.now() : executedAt);
        autoMergeLogRepository.save(log);
        notifyMergeRequestAuthor(log);
    }

    private void notifyMergeRequestAuthor(GitlabAutoMergeLogEntity log) {
        String authorUsername = trimToNull(log.getMergeRequestAuthorUsername());
        if (authorUsername == null || "EMPTY".equalsIgnoreCase(log.getResult())) {
            return;
        }
        notificationService.sendToGitlabUser(
                authorUsername,
                NotificationService.TYPE_GITLAB,
                resolveNotificationLevel(log.getResult()),
                buildGitlabNotificationTitle(log),
                buildGitlabNotificationContent(log),
                "/gitlab",
                buildGitlabNotificationBizType(log),
                log.getId()
        );
    }

    private String buildGitlabNotificationTitle(GitlabAutoMergeLogEntity log) {
        String mergeRequestLabel = log.getMergeRequestIid() == null ? "MR" : "MR !" + log.getMergeRequestIid();
        if ("MERGED".equalsIgnoreCase(log.getResult())) {
            return mergeRequestLabel + " 已自动合并";
        }
        if ("AI_REJECTED".equalsIgnoreCase(log.getResult())) {
            return mergeRequestLabel + " 被 AI 审核拒绝";
        }
        if (isBranchBehindNotification(log)) {
            return mergeRequestLabel + " 需先同步目标分支";
        }
        if ("FAILED".equalsIgnoreCase(log.getResult())) {
            return mergeRequestLabel + " 自动合并失败";
        }
        if ("SKIPPED".equalsIgnoreCase(log.getResult())) {
            return mergeRequestLabel + " 已跳过自动合并";
        }
        return "GitLab 自动合并结果更新";
    }

    private String buildGitlabNotificationContent(GitlabAutoMergeLogEntity log) {
        String title = hasText(log.getMergeRequestTitle()) ? "《" + log.getMergeRequestTitle().trim() + "》" : "你的 Merge Request";
        if ("MERGED".equalsIgnoreCase(log.getResult())) {
            return limitMessage(title + "已自动合并成功。");
        }
        if ("AI_REJECTED".equalsIgnoreCase(log.getResult())) {
            return limitMessage(title + "未通过 AI 审核，原因：" + defaultString(log.getReason()));
        }
        if (isBranchBehindNotification(log)) {
            return limitMessage(title + "暂未自动合并，源分支落后于目标分支，请先 rebase 或同步后再试。");
        }
        return limitMessage(title + " 的自动合并结果为「" + formatLogResultText(log.getResult()) + "」，原因：" + defaultString(log.getReason()));
    }

    private String resolveNotificationLevel(String result) {
        if ("MERGED".equalsIgnoreCase(result)) {
            return NotificationService.LEVEL_SUCCESS;
        }
        if ("FAILED".equalsIgnoreCase(result) || "AI_REJECTED".equalsIgnoreCase(result)) {
            return NotificationService.LEVEL_ERROR;
        }
        if ("SKIPPED".equalsIgnoreCase(result)) {
            return NotificationService.LEVEL_WARNING;
        }
        return NotificationService.LEVEL_INFO;
    }

    /**
     * 按日志结果细分前端消息中心展示用的业务类型，让不同 GitLab 场景有独立标签。
     */
    private String buildGitlabNotificationBizType(GitlabAutoMergeLogEntity log) {
        if ("MERGED".equalsIgnoreCase(log.getResult())) {
            return "GITLAB_MERGED";
        }
        if ("AI_REJECTED".equalsIgnoreCase(log.getResult())) {
            return "GITLAB_AI_REJECTED";
        }
        if (isBranchBehindNotification(log)) {
            return "GITLAB_BRANCH_BEHIND";
        }
        return "GITLAB_AUTO_MERGE_LOG";
    }

    private boolean isBranchBehindNotification(GitlabAutoMergeLogEntity log) {
        return "SKIPPED".equalsIgnoreCase(log.getResult())
                && defaultString(log.getReason()).startsWith(BRANCH_BEHIND_REASON_PREFIX);
    }

    private String buildLogDetailMarkdown(GitlabAutoMergeConfigEntity config,
                                          String triggerType,
                                          Long mergeRequestIid,
                                          String mergeRequestTitle,
                                          String result,
                                          String reason,
                                          String webUrl,
                                          LocalDateTime executedAt,
                                          String extraMarkdown) {
        StringBuilder builder = new StringBuilder();
        builder.append("# \u81ea\u52a8\u5408\u5e76\u65e5\u5fd7\u8be6\u60c5\n\n");
        builder.append("- \u7b56\u7565\uff1a").append(config.getName()).append("\n");
        builder.append("- \u89e6\u53d1\u65b9\u5f0f\uff1a").append(formatTriggerTypeText(triggerType)).append("\n");
        builder.append("- \u6267\u884c\u7ed3\u679c\uff1a").append(formatLogResultText(result)).append("\n");
        if (hasText(formatTime(executedAt))) {
            builder.append("- \u6267\u884c\u65f6\u95f4\uff1a").append(formatTime(executedAt)).append("\n");
        }
        if (mergeRequestIid != null) {
            builder.append("- Merge Request\uff1a!").append(mergeRequestIid);
            if (hasText(mergeRequestTitle)) {
                builder.append(" ").append(mergeRequestTitle.trim());
            }
            builder.append("\n");
        }
        if (hasText(webUrl)) {
            builder.append("- \u94fe\u63a5\uff1a").append(webUrl.trim()).append("\n");
        }
        builder.append("\n## \u539f\u56e0\u6458\u8981\n\n");
        builder.append(hasText(reason) ? reason.trim() : "\u65e0").append("\n");
        if (hasText(extraMarkdown)) {
            builder.append("\n").append(extraMarkdown.trim()).append("\n");
        }
        return builder.toString();
    }

    private String buildReviewExtraMarkdown(CodeReviewResult reviewResult) {
        if (hasText(reviewResult.reviewMarkdown())) {
            return "## Code Review \u8f93\u51fa\n\n" + reviewResult.reviewMarkdown().trim();
        }
        StringBuilder builder = new StringBuilder();
        builder.append("## Code Review \u8f93\u51fa\n\n");
        builder.append("### \u603b\u7ed3\n");
        builder.append(hasText(reviewResult.summary()) ? reviewResult.summary().trim() : "\u672a\u63d0\u4f9b\u5ba1\u67e5\u6458\u8981").append("\n\n");
        builder.append("### \u5173\u952e\u95ee\u9898\n");
        if (reviewResult.issues() == null || reviewResult.issues().isEmpty()) {
            builder.append("- \u672a\u63d0\u4f9b\u95ee\u9898\u5217\u8868\n");
        } else {
            for (String issue : reviewResult.issues()) {
                builder.append("- ").append(issue).append("\n");
            }
        }
        return builder.toString();
    }

    private String buildExceptionExtraMarkdown(String errorMessage) {
        if (!hasText(errorMessage)) {
            return null;
        }
        return "## \u9519\u8bef\u8be6\u60c5\n\n```text\n" + errorMessage.trim() + "\n```";
    }

    private String formatTriggerTypeText(String triggerType) {
        return TRIGGER_SCHEDULED.equalsIgnoreCase(triggerType) ? "\u5b9a\u65f6\u8c03\u5ea6" : "\u624b\u52a8\u6267\u884c";
    }

    private String formatLogResultText(String result) {
        if ("MERGED".equalsIgnoreCase(result)) {
            return "\u5df2\u5408\u5e76";
        }
        if ("SKIPPED".equalsIgnoreCase(result)) {
            return "\u5df2\u8df3\u8fc7";
        }
        if ("AI_REJECTED".equalsIgnoreCase(result)) {
            return "AI \u5ba1\u6838\u62d2\u7edd";
        }
        if ("EMPTY".equalsIgnoreCase(result)) {
            return "\u65e0\u53ef\u6267\u884c MR";
        }
        if ("FAILED".equalsIgnoreCase(result)) {
            return "\u6267\u884c\u5931\u8d25";
        }
        return defaultString(result);
    }

    private String limitDetailMarkdown(String markdown) {
        if (!hasText(markdown)) {
            return null;
        }
        String value = markdown.trim();
        return value.length() > 20000 ? value.substring(0, 20000) : value;
    }

    /**
     * 将 GitLab 分支对象转换为前端下拉项，并优先补全可跳转的分支链接。
     */
    private GitlabBranchSummary toBranchSummary(ProjectGitlabBindingEntity entity, GitlabApiService.GitlabBranch branch) {
        return new GitlabBranchSummary(
                branch.name(),
                defaultBoolean(branch.defaultBranch(), false),
                defaultBoolean(branch.protectedBranch(), false),
                defaultBoolean(branch.merged(), false),
                hasText(branch.webUrl()) ? branch.webUrl() : buildBindingBranchWebUrl(entity, branch.name())
        );
    }

    /**
     * 将 GitLab Tag 返回结果整理成前端结果弹窗所需字段。
     */
    private GitlabTagCreateResult toTagCreateResult(ProjectGitlabBindingEntity entity,
                                                    String projectRef,
                                                    String branchName,
                                                    GitlabApiService.GitlabTag tag) {
        return new GitlabTagCreateResult(
                entity.getProject().getName(),
                projectRef,
                branchName,
                tag.name(),
                trimToNull(tag.message()),
                trimToNull(tag.target()),
                defaultBoolean(tag.protectedTag(), false),
                buildBindingTagWebUrl(entity, tag.name()),
                hasText(tag.createdAt()) ? tag.createdAt() : formatTime(LocalDateTime.now())
        );
    }

    private ProjectGitlabBindingSummary toBindingSummary(ProjectGitlabBindingEntity entity) {
        return new ProjectGitlabBindingSummary(entity.getId(), entity.getProject().getId(), entity.getProject().getName(), entity.getApiBaseUrl(), entity.getGitlabProjectRef(), entity.getGitlabProjectId(), entity.getGitlabProjectName(), entity.getGitlabProjectPath(), entity.getGitlabProjectWebUrl(), entity.getDefaultTargetBranch(), hasText(entity.getTokenCiphertext()), defaultBoolean(entity.getEnabled(), true), entity.getLastTestStatus(), entity.getLastTestMessage(), formatTime(entity.getLastTestedAt()));
    }

    /**
     * 统一拼接扫描任务标题，避免执行中心里出现难以辨认的默认标题。
     */
    private String buildScanTaskTitle(ProjectGitlabBindingEntity binding, String branch) {
        return "仓库规范扫描 - "
                + binding.getProject().getName()
                + "/"
                + defaultString(hasText(binding.getGitlabProjectPath()) ? binding.getGitlabProjectPath() : binding.getGitlabProjectRef())
                + " ["
                + defaultString(branch)
                + "]";
    }

    /**
     * 将扫描参数固化到执行任务输入载荷，调度阶段不再依赖前端上下文。
     */
    private java.util.Map<String, Object> buildScanInputPayload(ProjectGitlabBindingEntity binding,
                                                                String branch,
                                                                RepositoryScanRulesetEntity ruleset,
                                                                AgentEntity planAgent) {
        LinkedHashMap<String, Object> payload = new LinkedHashMap<>();
        payload.put("bindingId", binding.getId());
        payload.put("branch", branch);
        payload.put("rulesetCode", ruleset.getCode());
        payload.put("rulesetSnapshot", repositoryScanRulesetService.buildRulesetSnapshot(ruleset));
        payload.put("repoPath", hasText(binding.getGitlabProjectPath()) ? binding.getGitlabProjectPath() : binding.getGitlabProjectRef());
        payload.put("projectName", binding.getProject().getName());
        if (planAgent != null) {
            payload.put("planAgentId", planAgent.getId());
            payload.put("planAgentName", planAgent.getName());
        }
        return java.util.Map.copyOf(payload);
    }

    /**
     * 仓库扫描计划智能体为可选配置，只有内置计划智能体才允许写入扫描任务快照。
     */
    private AgentEntity resolveRepositoryScanPlanAgent(Long planAgentId) {
        if (planAgentId == null) {
            return null;
        }
        AgentEntity agent = requireAgent(planAgentId);
        agentExecutionService.validateRepositoryScanPlanAgent(planAgentId);
        return agent;
    }

    /**
     * 解析扫描任务要使用的规则集。
     * 当前规则集为空时自动回退为系统默认规则集。
     */
    private RepositoryScanRulesetEntity resolveScanRuleset(String requestedRulesetCode) {
        String rulesetCode = trimToNull(requestedRulesetCode);
        RepositoryScanRulesetEntity ruleset = hasText(rulesetCode)
                ? repositoryScanRulesetService.requireRulesetByCode(rulesetCode)
                : repositoryScanRulesetService.requireDefaultRuleset();
        if (!Boolean.TRUE.equals(ruleset.getEnabled())) {
            throw new IllegalArgumentException("所选规则集未启用");
        }
        return ruleset;
    }

    private GitlabAutoMergeConfigSummary toAutoMergeSummary(GitlabAutoMergeConfigEntity entity) {
        Long bindingId = entity.getBinding() == null ? null : entity.getBinding().getId();
        Long projectId = entity.getBinding() == null ? null : entity.getBinding().getProject().getId();
        String projectName = entity.getBinding() == null ? "-" : entity.getBinding().getProject().getName();
        String apiBaseUrl = entity.getBinding() == null ? entity.getApiBaseUrl() : entity.getBinding().getApiBaseUrl();
        String projectRef = entity.getBinding() == null ? entity.getGitlabProjectRef() : resolveBindingProjectRef(entity.getBinding());
        boolean tokenConfigured = entity.getBinding() == null ? hasText(entity.getTokenCiphertext()) : hasText(entity.getBinding().getTokenCiphertext());
        Long reviewAgentId = entity.getReviewAgent() == null ? null : entity.getReviewAgent().getId();
        String reviewAgentName = entity.getReviewAgent() == null ? null : entity.getReviewAgent().getName();
        Long aiModelConfigId = entity.getAiModelConfig() == null ? null : entity.getAiModelConfig().getId();
        String aiModelConfigName = entity.getAiModelConfig() == null ? null : entity.getAiModelConfig().getName();
        String aiModelProvider = entity.getAiModelConfig() == null ? null : entity.getAiModelConfig().getProvider();
        String aiModelName = entity.getAiModelConfig() == null ? null : entity.getAiModelConfig().getModelName();
        return new GitlabAutoMergeConfigSummary(
                entity.getId(),
                entity.getName(),
                entity.getExecutionMode(),
                entity.getDescription(),
                bindingId,
                projectId,
                projectName,
                apiBaseUrl,
                projectRef,
                tokenConfigured,
                reviewAgentId,
                reviewAgentName,
                aiModelConfigId,
                aiModelConfigName,
                aiModelProvider,
                aiModelName,
                entity.getSourceBranch(),
                effectiveTargetBranch(entity),
                entity.getTitleKeyword(),
                defaultBoolean(entity.getEnabled(), true),
                defaultBoolean(entity.getAutoMerge(), true),
                defaultBoolean(entity.getSquashOnMerge(), false),
                defaultBoolean(entity.getRemoveSourceBranch(), true),
                defaultBoolean(entity.getTriggerPipelineAfterMerge(), false),
                defaultBoolean(entity.getRequirePipelineSuccess(), true),
                defaultBoolean(entity.getSchedulerEnabled(), false),
                entity.getSchedulerCron(),
                computeNextExecutionTime(entity),
                defaultBoolean(entity.getAiReviewEnabled(), false),
                entity.getAiReviewPrompt(),
                entity.getLastRunStatus(),
                entity.getLastRunMessage(),
                formatTime(entity.getLastRunAt())
        );
    }


    private GitlabAutoMergeLogSummary toAutoMergeLogSummary(GitlabAutoMergeLogEntity entity) {
        Long configId = entity.getConfig() == null ? null : entity.getConfig().getId();
        return new GitlabAutoMergeLogSummary(
                entity.getId(),
                configId,
                entity.getConfigName(),
                entity.getTriggerType(),
                entity.getMergeRequestIid(),
                entity.getMergeRequestTitle(),
                entity.getMergeRequestAuthorName(),
                entity.getMergeRequestAuthorUsername(),
                entity.getResult(),
                entity.getReason(),
                entity.getDetailMarkdown(),
                entity.getWebUrl(),
                formatTime(entity.getExecutedAt())
        );
    }

    private GitlabMergeRequestSummary toMergeRequestSummary(GitlabApiService.GitlabMergeRequest item) {
        return new GitlabMergeRequestSummary(item.iid(), item.title(), item.state(), item.sourceBranch(), item.targetBranch(), item.draft(), item.hasConflicts(), item.detailedMergeStatus(), item.divergedCommitsCount(), item.pipelineStatus(), item.authorName(), item.webUrl(), item.updatedAt());
    }

    /**
     * 为项目相关查询统一补齐项目可见范围条件。
     */
    private void appendProjectVisibilityPredicate(List<Predicate> predicates,
                                                  jakarta.persistence.criteria.From<?, ProjectEntity> projectRoot,
                                                  jakarta.persistence.criteria.CriteriaQuery<?> query,
                                                  jakarta.persistence.criteria.CriteriaBuilder cb,
                                                  ProjectDataPermissionService.ProjectDataScope scope) {
        if (scope.superAdmin()) {
            return;
        }
        DataPermissionScopeType visibilityScope = scope.policy().projectVisibilityScope();
        switch (visibilityScope) {
            case ALL -> {
                return;
            }
            case NONE -> predicates.add(cb.disjunction());
            case OWNER_ONLY -> predicates.add(cb.equal(projectRoot.join("ownerUser", JoinType.LEFT).get("id"), scope.userId()));
            case CREATOR_ONLY -> predicates.add(cb.equal(projectRoot.join("creatorUser", JoinType.LEFT).get("id"), scope.userId()));
            case OWNER_OR_CREATOR -> predicates.add(cb.or(
                    cb.equal(projectRoot.join("ownerUser", JoinType.LEFT).get("id"), scope.userId()),
                    cb.equal(projectRoot.join("creatorUser", JoinType.LEFT).get("id"), scope.userId())
            ));
            case PROJECT_PARTICIPANT -> {
                query.distinct(true);
                predicates.add(cb.or(
                        cb.equal(projectRoot.join("ownerUser", JoinType.LEFT).get("id"), scope.userId()),
                        cb.equal(projectRoot.join("creatorUser", JoinType.LEFT).get("id"), scope.userId()),
                        cb.equal(projectRoot.join("members", JoinType.LEFT).get("id"), scope.userId())
                ));
            }
        }
    }

    /**
     * 项目型自动合并策略受绑定项目约束，独立策略则继续作为全局配置展示。
     */
    private void appendAutoMergeConfigVisibilityPredicate(List<Predicate> predicates,
                                                          jakarta.persistence.criteria.Root<GitlabAutoMergeConfigEntity> root,
                                                          jakarta.persistence.criteria.CriteriaQuery<?> query,
                                                          jakarta.persistence.criteria.CriteriaBuilder cb,
                                                          ProjectDataPermissionService.ProjectDataScope scope) {
        if (scope.superAdmin()) {
            return;
        }
        DataPermissionScopeType visibilityScope = scope.policy().projectVisibilityScope();
        var bindingJoin = root.join("binding", JoinType.LEFT);
        var projectJoin = bindingJoin.join("project", JoinType.LEFT);
        switch (visibilityScope) {
            case ALL -> {
                return;
            }
            case NONE -> predicates.add(cb.equal(root.get("executionMode"), MODE_STANDALONE));
            case OWNER_ONLY -> predicates.add(cb.or(
                    cb.equal(root.get("executionMode"), MODE_STANDALONE),
                    cb.equal(projectJoin.join("ownerUser", JoinType.LEFT).get("id"), scope.userId())
            ));
            case CREATOR_ONLY -> predicates.add(cb.or(
                    cb.equal(root.get("executionMode"), MODE_STANDALONE),
                    cb.equal(projectJoin.join("creatorUser", JoinType.LEFT).get("id"), scope.userId())
            ));
            case OWNER_OR_CREATOR -> predicates.add(cb.or(
                    cb.equal(root.get("executionMode"), MODE_STANDALONE),
                    cb.equal(projectJoin.join("ownerUser", JoinType.LEFT).get("id"), scope.userId()),
                    cb.equal(projectJoin.join("creatorUser", JoinType.LEFT).get("id"), scope.userId())
            ));
            case PROJECT_PARTICIPANT -> {
                query.distinct(true);
                predicates.add(cb.or(
                        cb.equal(root.get("executionMode"), MODE_STANDALONE),
                        cb.equal(projectJoin.join("ownerUser", JoinType.LEFT).get("id"), scope.userId()),
                        cb.equal(projectJoin.join("creatorUser", JoinType.LEFT).get("id"), scope.userId()),
                        cb.equal(projectJoin.join("members", JoinType.LEFT).get("id"), scope.userId())
                ));
            }
        }
    }

    /**
     * 自动合并日志依赖项目快照过滤，缺少项目快照的日志视为全局数据。
     */
    private void appendAutoMergeLogVisibilityPredicate(List<Predicate> predicates,
                                                       jakarta.persistence.criteria.Root<GitlabAutoMergeLogEntity> root,
                                                       jakarta.persistence.criteria.CriteriaQuery<?> query,
                                                       jakarta.persistence.criteria.CriteriaBuilder cb,
                                                       ProjectDataPermissionService.ProjectDataScope scope) {
        if (scope.superAdmin()) {
            return;
        }
        DataPermissionScopeType visibilityScope = scope.policy().projectVisibilityScope();
        var projectJoin = root.join("project", JoinType.LEFT);
        switch (visibilityScope) {
            case ALL -> {
                return;
            }
            case NONE -> predicates.add(cb.isNull(root.get("project")));
            case OWNER_ONLY -> predicates.add(cb.or(
                    cb.isNull(root.get("project")),
                    cb.equal(projectJoin.join("ownerUser", JoinType.LEFT).get("id"), scope.userId())
            ));
            case CREATOR_ONLY -> predicates.add(cb.or(
                    cb.isNull(root.get("project")),
                    cb.equal(projectJoin.join("creatorUser", JoinType.LEFT).get("id"), scope.userId())
            ));
            case OWNER_OR_CREATOR -> predicates.add(cb.or(
                    cb.isNull(root.get("project")),
                    cb.equal(projectJoin.join("ownerUser", JoinType.LEFT).get("id"), scope.userId()),
                    cb.equal(projectJoin.join("creatorUser", JoinType.LEFT).get("id"), scope.userId())
            ));
            case PROJECT_PARTICIPANT -> {
                query.distinct(true);
                predicates.add(cb.or(
                        cb.isNull(root.get("project")),
                        cb.equal(projectJoin.join("ownerUser", JoinType.LEFT).get("id"), scope.userId()),
                        cb.equal(projectJoin.join("creatorUser", JoinType.LEFT).get("id"), scope.userId()),
                        cb.equal(projectJoin.join("members", JoinType.LEFT).get("id"), scope.userId())
                ));
            }
        }
    }

    private ProjectEntity resolveConfigProject(GitlabAutoMergeConfigEntity config) {
        if (config == null || config.getBinding() == null) {
            return null;
        }
        return config.getBinding().getProject();
    }

    private Pageable buildPageable(int page, int size, Sort sort) {
        int safePage = Math.max(page, 1);
        int safeSize = Math.max(1, Math.min(size, 100));
        return PageRequest.of(safePage - 1, safeSize, sort);
    }

    private Specification<ProjectGitlabBindingEntity> bindingSpecification(String keyword, Long projectId,
                                                                           ProjectDataPermissionService.ProjectDataScope scope) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            appendProjectVisibilityPredicate(predicates, root.join("project", JoinType.INNER), query, cb, scope);
            if (hasText(keyword)) {
                String pattern = "%" + keyword.trim().toLowerCase() + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("project").get("name")), pattern),
                        cb.like(cb.lower(root.get("gitlabProjectRef")), pattern),
                        cb.like(cb.lower(root.get("gitlabProjectPath")), pattern),
                        cb.like(cb.lower(root.get("gitlabProjectName")), pattern)
                ));
            }
            if (projectId != null) {
                predicates.add(cb.equal(root.get("project").get("id"), projectId));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    private Specification<GitlabAutoMergeConfigEntity> autoMergeSpecification(String keyword, String executionMode, Boolean enabled,
                                                                              ProjectDataPermissionService.ProjectDataScope scope) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            appendAutoMergeConfigVisibilityPredicate(predicates, root, query, cb, scope);
            if (hasText(keyword)) {
                String pattern = "%" + keyword.trim().toLowerCase() + "%";
                var bindingJoin = root.join("binding", JoinType.LEFT);
                var projectJoin = bindingJoin.join("project", JoinType.LEFT);
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("name")), pattern),
                        cb.like(cb.lower(root.get("description")), pattern),
                        cb.like(cb.lower(root.get("gitlabProjectRef")), pattern),
                        cb.like(cb.lower(projectJoin.get("name")), pattern)
                ));
            }
            if (hasText(executionMode)) {
                predicates.add(cb.equal(root.get("executionMode"), normalizeExecutionMode(executionMode)));
            }
            if (enabled != null) {
                predicates.add(cb.equal(root.get("enabled"), enabled));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    private Specification<GitlabAutoMergeLogEntity> autoMergeLogSpecification(Long configId, String result, String triggerType,
                                                                               String mergeRequestAuthorUsername,
                                                                               ProjectDataPermissionService.ProjectDataScope scope) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            appendAutoMergeLogVisibilityPredicate(predicates, root, query, cb, scope);
            if (configId != null) {
                predicates.add(cb.equal(root.get("config").get("id"), configId));
            }
            if (hasText(result)) {
                predicates.add(cb.equal(root.get("result"), result.trim().toUpperCase()));
            }
            if (hasText(triggerType)) {
                predicates.add(cb.equal(root.get("triggerType"), normalizeTriggerType(triggerType)));
            }
            if (hasText(mergeRequestAuthorUsername)) {
                predicates.add(cb.equal(cb.lower(root.get("mergeRequestAuthorUsername")), mergeRequestAuthorUsername.trim().toLowerCase()));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    private ProjectEntity requireProject(Long id) {
        ProjectEntity project = projectRepository.findById(id).orElseThrow(() -> new NoSuchElementException("项目不存在: " + id));
        ProjectDataPermissionService.ProjectDataScope scope = projectDataPermissionService.currentScopeOrNull();
        if (scope != null) {
            projectDataPermissionService.requireProjectVisible(project, scope);
        }
        return project;
    }

    private ProjectGitlabBindingEntity requireBinding(Long id) {
        ProjectGitlabBindingEntity binding = bindingRepository.findById(id).orElseThrow(() -> new NoSuchElementException("GitLab 绑定不存在: " + id));
        ProjectDataPermissionService.ProjectDataScope scope = projectDataPermissionService.currentScopeOrNull();
        if (scope != null) {
            projectDataPermissionService.requireGitlabBindingVisible(binding);
        }
        return binding;
    }

    /**
     * 允许一个业务项目绑定多个仓库，但仍然拦截同一项目下对同一仓库的重复绑定。
     */
    private void validateBindingUniqueness(Long projectId, String apiBaseUrl, String projectRef, Long currentBindingId) {
        boolean duplicated = currentBindingId == null
                ? bindingRepository.existsByProject_IdAndApiBaseUrlAndGitlabProjectRef(projectId, apiBaseUrl, projectRef)
                : bindingRepository.existsByProject_IdAndApiBaseUrlAndGitlabProjectRefAndIdNot(projectId, apiBaseUrl, projectRef, currentBindingId);
        if (duplicated) {
            throw new IllegalArgumentException("当前项目已绑定该 GitLab 仓库，请勿重复创建");
        }
    }

    /**
     * 基础字符串参数统一按前端表单语义校验，避免空格值直接透传给 GitLab。
     */
    private String requireValue(String value, String fieldLabel) {
        String normalized = trimToNull(value);
        if (!hasText(normalized)) {
            throw new IllegalArgumentException(fieldLabel + "不能为空");
        }
        return normalized;
    }

    /**
     * 创建 MR 时必须保证源分支和目标分支不同，否则 GitLab 会直接拒绝请求。
     */
    private void requireDifferentBranches(String sourceBranch, String targetBranch) {
        if (sourceBranch.equalsIgnoreCase(targetBranch)) {
            throw new IllegalArgumentException("源分支与目标分支不能相同");
        }
    }

    private AgentEntity requireAgent(Long id) {
        AgentEntity agent = agentRepository.findById(id).orElseThrow(() -> new NoSuchElementException("Agent 不存在: " + id));
        ProjectDataPermissionService.ProjectDataScope scope = projectDataPermissionService.currentScopeOrNull();
        if (scope != null) {
            projectDataPermissionService.requireAgentVisible(agent);
        }
        return agent;
    }

    private GitlabAutoMergeConfigEntity requireAutoMergeConfig(Long id) {
        GitlabAutoMergeConfigEntity config = autoMergeConfigRepository.findById(id).orElseThrow(() -> new NoSuchElementException("自动合并策略不存在: " + id));
        ProjectDataPermissionService.ProjectDataScope scope = projectDataPermissionService.currentScopeOrNull();
        if (scope != null && MODE_PROJECT_BOUND.equals(config.getExecutionMode())) {
            ProjectEntity project = resolveConfigProject(config);
            if (project == null) {
                throw new NoSuchElementException("自动合并策略不存在: " + id);
            }
            projectDataPermissionService.requireProjectVisible(project, scope);
        }
        return config;
    }

    private AiModelConfigEntity requireAiModelConfig(Long id) {
        return aiModelConfigRepository.findById(id).orElseThrow(() -> new NoSuchElementException("模型配置不存在: " + id));
    }

    private String resolveApiBaseUrl(String value) {
        String apiBaseUrl = hasText(value) ? value.trim() : defaultApiUrl;
        while (apiBaseUrl.endsWith("/")) {
            apiBaseUrl = apiBaseUrl.substring(0, apiBaseUrl.length() - 1);
        }
        if (!hasText(apiBaseUrl)) {
            throw new IllegalArgumentException("GitLab API 地址不能为空");
        }
        return apiBaseUrl;
    }

    private String requireProjectRef(String value) {
        String projectRef = trimToNull(value);
        if (!hasText(projectRef)) {
            throw new IllegalArgumentException("GitLab 项目标识不能为空，请填写项目 ID 或 group/path");
        }
        return projectRef;
    }

    private String requireToken(String value) {
        String token = trimToNull(value);
        if (!hasText(token)) {
            throw new IllegalArgumentException("APIToken 不能为空");
        }
        return token;
    }

    private String normalizeExecutionMode(String value) {
        String mode = trimToNull(value);
        if (mode != null) {
            mode = mode.toUpperCase();
        }
        if (!MODE_PROJECT_BOUND.equals(mode) && !MODE_STANDALONE.equals(mode)) {
            throw new IllegalArgumentException("执行模式仅支持 PROJECT_BOUND 或 STANDALONE");
        }
        return mode;
    }

    private String normalizeTriggerType(String value) {
        String type = trimToNull(value);
        if (type != null) {
            type = type.toUpperCase();
        }
        if (!TRIGGER_MANUAL.equals(type) && !TRIGGER_SCHEDULED.equals(type)) {
            throw new IllegalArgumentException("触发方式仅支持 MANUAL 或 SCHEDULED");
        }
        return type;
    }

    private String normalizeSchedulerCron(String value) {
        String cron = trimToNull(value);
        if (!hasText(cron)) {
            return null;
        }
        try {
            CronExpression.parse(cron);
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException("调度 Cron 表达式格式不正确");
        }
        return cron;
    }

    private boolean shouldRunScheduled(GitlabAutoMergeConfigEntity config, LocalDateTime now) {
        if (!Boolean.TRUE.equals(config.getSchedulerEnabled())) {
            return false;
        }
        String cron = config.getSchedulerCron();
        if (!hasText(cron)) {
            return false;
        }
        CronExpression expression;
        try {
            expression = CronExpression.parse(cron);
        } catch (IllegalArgumentException exception) {
            config.setLastRunStatus("FAILED");
            config.setLastRunMessage("调度 Cron 表达式无效");
            config.setLastRunAt(LocalDateTime.now());
            autoMergeConfigRepository.save(config);
            return false;
        }

        LocalDateTime checkPoint = now.minusSeconds(1);
        LocalDateTime next = expression.next(checkPoint);
        if (next == null || !next.truncatedTo(ChronoUnit.SECONDS).equals(now)) {
            return false;
        }
        return config.getLastScheduledAt() == null
                || !config.getLastScheduledAt().truncatedTo(ChronoUnit.SECONDS).equals(now);
    }

    private String computeNextExecutionTime(GitlabAutoMergeConfigEntity config) {
        if (!Boolean.TRUE.equals(config.getSchedulerEnabled()) || !hasText(config.getSchedulerCron())) {
            return null;
        }
        try {
            CronExpression expression = CronExpression.parse(config.getSchedulerCron());
            LocalDateTime next = expression.next(LocalDateTime.now());
            return formatTime(next);
        } catch (IllegalArgumentException exception) {
            return null;
        }
    }

    private String buildMergeMessage(GitlabApiService.GitlabMergeResult result) {
        if (hasText(result.mergeCommitSha())) {
            return "已提交合并，commit: " + result.mergeCommitSha();
        }
        if (hasText(result.message()) && !"ok".equalsIgnoreCase(result.message())) {
            return limitMessage(result.message());
        }
        return "已触发 GitLab 合并";
    }

    private String buildMergedWithPipelineMessage(String mergeMessage, CicdManagementService.PipelineTriggerOutcome pipelineOutcome) {
        if (pipelineOutcome == null) {
            return mergeMessage;
        }
        boolean multipleBindings = pipelineOutcome.bindingOutcomes() != null && pipelineOutcome.bindingOutcomes().size() > 1;
        return switch (pipelineOutcome.status()) {
            case "SUCCESS" -> limitMessage(mergeMessage + "；" + (multipleBindings ? defaultString(pipelineOutcome.message()) : "已触发 Jenkins 流水线"));
            case "SKIPPED" -> limitMessage(mergeMessage + "；未触发 Jenkins：" + defaultString(pipelineOutcome.message()));
            case "FAILED" -> limitMessage(mergeMessage + "；Jenkins 触发失败：" + defaultString(pipelineOutcome.message()));
            case "PARTIAL" -> limitMessage(mergeMessage + "；Jenkins 部分触发：" + defaultString(pipelineOutcome.message()));
            default -> limitMessage(mergeMessage);
        };
    }

    private String buildPipelineTriggerMarkdown(CicdManagementService.PipelineTriggerOutcome pipelineOutcome) {
        if (pipelineOutcome == null) {
            return null;
        }
        StringBuilder builder = new StringBuilder();
        builder.append("## Jenkins 流水线触发结果\n\n");
        builder.append("- 状态：").append(formatPipelineTriggerStatusText(pipelineOutcome.status())).append("\n");
        if (hasText(pipelineOutcome.message())) {
            builder.append("- 摘要：").append(pipelineOutcome.message().trim()).append("\n");
        }
        if (pipelineOutcome.bindingOutcomes() == null || pipelineOutcome.bindingOutcomes().isEmpty()) {
            return builder.toString();
        }
        builder.append("\n");
        // 多条 Jenkins 绑定需要逐条输出状态，方便在合并日志中定位具体哪一条失败或被跳过。
        for (int index = 0; index < pipelineOutcome.bindingOutcomes().size(); index++) {
            CicdManagementService.PipelineBindingOutcome bindingOutcome = pipelineOutcome.bindingOutcomes().get(index);
            if (pipelineOutcome.bindingOutcomes().size() > 1) {
                builder.append("### 绑定 ").append(index + 1).append("\n\n");
            }
            builder.append("- 状态：").append(formatPipelineTriggerStatusText(bindingOutcome.status())).append("\n");
            if (hasText(bindingOutcome.jenkinsServerName())) {
                builder.append("- Jenkins 服务：").append(bindingOutcome.jenkinsServerName().trim()).append("\n");
            }
            if (hasText(bindingOutcome.jobName())) {
                builder.append("- Job：").append(bindingOutcome.jobName().trim()).append("\n");
            }
            if (hasText(bindingOutcome.message())) {
                builder.append("- 说明：").append(bindingOutcome.message().trim()).append("\n");
            }
            if (hasText(bindingOutcome.triggerUrl())) {
                builder.append("- 链接：").append(bindingOutcome.triggerUrl().trim()).append("\n");
            }
            if (index < pipelineOutcome.bindingOutcomes().size() - 1) {
                builder.append("\n");
            }
        }
        return builder.toString();
    }

    private String formatPipelineTriggerStatusText(String status) {
        if ("SUCCESS".equalsIgnoreCase(status)) {
            return "触发成功";
        }
        if ("FAILED".equalsIgnoreCase(status)) {
            return "触发失败";
        }
        if ("PARTIAL".equalsIgnoreCase(status)) {
            return "部分成功";
        }
        if ("SKIPPED".equalsIgnoreCase(status)) {
            return "已跳过";
        }
        return defaultString(status);
    }

    private boolean isSourceBranchBehindTarget(GitlabApiService.GitlabMergeRequest mergeRequest) {
        Integer divergedCommitsCount = mergeRequest.divergedCommitsCount();
        if (divergedCommitsCount != null && divergedCommitsCount > 0) {
            return true;
        }
        String detailedMergeStatus = trimToNull(mergeRequest.detailedMergeStatus());
        return detailedMergeStatus != null && "need_rebase".equalsIgnoreCase(detailedMergeStatus);
    }

    private String buildSourceBranchBehindReason(GitlabApiService.GitlabMergeRequest mergeRequest) {
        Integer divergedCommitsCount = mergeRequest.divergedCommitsCount();
        if (divergedCommitsCount != null && divergedCommitsCount > 0) {
            return "\u6e90\u5206\u652f\u843d\u540e\u4e8e\u76ee\u6807\u5206\u652f " + divergedCommitsCount + " \u4e2a\u63d0\u4ea4\uff0c\u8bf7\u5148\u540c\u6b65\u76ee\u6807\u5206\u652f\u540e\u518d\u81ea\u52a8\u5408\u5e76";
        }
        return "\u6e90\u5206\u652f\u843d\u540e\u4e8e\u76ee\u6807\u5206\u652f\uff0c\u5f53\u524d Merge Request \u9700\u8981\u5148 rebase/\u540c\u6b65\u540e\u518d\u81ea\u52a8\u5408\u5e76";
    }

    private String buildMergeRequestStatusMarkdown(GitlabApiService.GitlabMergeRequest mergeRequest) {
        StringBuilder builder = new StringBuilder();
        builder.append("## Merge Request \u72b6\u6001\n\n");
        builder.append("- \u6e90\u5206\u652f\uff1a").append(hasText(mergeRequest.sourceBranch()) ? mergeRequest.sourceBranch().trim() : "\u65e0").append("\n");
        builder.append("- \u76ee\u6807\u5206\u652f\uff1a").append(hasText(mergeRequest.targetBranch()) ? mergeRequest.targetBranch().trim() : "\u65e0").append("\n");
        builder.append("- \u8be6\u7ec6\u5408\u5e76\u72b6\u6001\uff1a").append(hasText(mergeRequest.detailedMergeStatus()) ? mergeRequest.detailedMergeStatus().trim() : "\u672a\u77e5").append("\n");
        if (mergeRequest.divergedCommitsCount() != null) {
            builder.append("- \u843d\u540e\u63d0\u4ea4\u6570\uff1a").append(mergeRequest.divergedCommitsCount()).append("\n");
        }
        if (hasText(mergeRequest.pipelineStatus())) {
            builder.append("- Pipeline \u72b6\u6001\uff1a").append(mergeRequest.pipelineStatus().trim()).append("\n");
        }
        return builder.toString();
    }

    private String defaultString(String value) {
        return value == null ? "" : value.trim();
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    /**
     * 根据绑定信息推导仓库页面地址，优先复用连通性测试回写的 GitLab 页面链接。
     */
    private String resolveBindingProjectWebUrl(ProjectGitlabBindingEntity entity) {
        if (hasText(entity.getGitlabProjectWebUrl())) {
            return entity.getGitlabProjectWebUrl().trim();
        }
        String projectPath = trimToNull(entity.getGitlabProjectPath());
        if (projectPath == null) {
            String projectRef = trimToNull(entity.getGitlabProjectRef());
            if (projectRef == null || projectRef.matches("^\\d+$")) {
                return null;
            }
            projectPath = projectRef;
        }
        String baseUrl = entity.getApiBaseUrl() == null ? null : entity.getApiBaseUrl().replaceAll("/api/v4/?$", "").replaceAll("/+$", "");
        if (!hasText(baseUrl)) {
            return null;
        }
        return baseUrl + "/" + projectPath;
    }

    /**
     * 分支接口偶发不返回跳转链接，这里按 GitLab 页面路由补齐。
     */
    private String buildBindingBranchWebUrl(ProjectGitlabBindingEntity entity, String branchName) {
        String projectWebUrl = resolveBindingProjectWebUrl(entity);
        if (!hasText(projectWebUrl) || !hasText(branchName)) {
            return null;
        }
        return projectWebUrl + "/-/branches/" + urlEncodePathSegment(branchName);
    }

    /**
     * Tag 创建成功后拼出 Tag 页链接，方便结果弹窗直接跳转。
     */
    private String buildBindingTagWebUrl(ProjectGitlabBindingEntity entity, String tagName) {
        String projectWebUrl = resolveBindingProjectWebUrl(entity);
        if (!hasText(projectWebUrl) || !hasText(tagName)) {
            return null;
        }
        return projectWebUrl + "/-/tags/" + urlEncodePathSegment(tagName);
    }

    private String urlEncodePathSegment(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private boolean defaultBoolean(Boolean value, boolean defaultValue) {
        return value == null ? defaultValue : value;
    }

    private String formatTime(LocalDateTime time) {
        return time == null ? null : time.format(TIME_FORMATTER);
    }

    private String limitMessage(String message) {
        if (!hasText(message)) {
            return "执行失败";
        }
        String value = message.trim();
        return value.length() > 1000 ? value.substring(0, 1000) : value;
    }

    private record ResolvedGitlabConfig(String apiBaseUrl, String token, String projectRef, String targetBranch) {
    }
}
