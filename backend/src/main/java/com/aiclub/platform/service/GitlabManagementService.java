package com.aiclub.platform.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.aiclub.platform.common.DataPermissionScopeType;
import com.aiclub.platform.domain.model.AiModelConfigEntity;
import com.aiclub.platform.domain.model.AgentEntity;
import com.aiclub.platform.domain.model.GitlabAutoMergePipelineTargetEntity;
import com.aiclub.platform.domain.model.GitlabAutoMergeConfigEntity;
import com.aiclub.platform.domain.model.GitlabAutoMergeWebhookEntity;
import com.aiclub.platform.domain.model.GitlabCodeStructureSnapshotEntity;
import com.aiclub.platform.domain.model.GitlabAutoMergeLogEntity;
import com.aiclub.platform.domain.model.GitlabAutoMergeLogIssueFeedbackEntity;
import com.aiclub.platform.domain.model.GitlabAutoMergeProjectShareEntity;
import com.aiclub.platform.domain.model.AiClubPipelineEntity;
import com.aiclub.platform.domain.model.ProjectPipelineBindingEntity;
import com.aiclub.platform.domain.model.GitlabProductBranchEntity;
import com.aiclub.platform.domain.model.GitlabProductBranchSyncLogEntity;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.ProjectGitlabBindingEntity;
import com.aiclub.platform.domain.model.RepositoryScanRulesetEntity;
import com.aiclub.platform.dto.CodeReviewResult;
import com.aiclub.platform.dto.ReviewIssueItem;
import com.aiclub.platform.dto.ExecutionTaskSummary;
import com.aiclub.platform.dto.GitlabAutoMergeConfigSummary;
import com.aiclub.platform.dto.GitlabAutoMergeLogSummary;
import com.aiclub.platform.dto.GitlabAutoMergeLogIssueFeedbackSummary;
import com.aiclub.platform.dto.GitlabAutoMergePipelineTargetSummary;
import com.aiclub.platform.dto.GitlabAutoMergeProjectShareSummary;
import com.aiclub.platform.dto.GitlabAutoMergePublicLogPage;
import com.aiclub.platform.dto.AiClubPipelineRunSummary;
import com.aiclub.platform.dto.JenkinsBuildSummary;
import com.aiclub.platform.dto.ProjectPublicPipelineSummary;
import com.aiclub.platform.dto.ProjectPublicPipelineRunSummary;
import com.aiclub.platform.dto.ProjectPublicPipelineRunPage;
import com.aiclub.platform.dto.GitlabAutoMergeRunItem;
import com.aiclub.platform.dto.GitlabAutoMergeRunResult;
import com.aiclub.platform.dto.GitlabAutoMergeWebhookSummary;
import com.aiclub.platform.dto.GitlabBranchSummary;
import com.aiclub.platform.dto.GitlabCodeStructureCandidateSymbolSummary;
import com.aiclub.platform.dto.GitlabCodeStructureGraphEdgeSummary;
import com.aiclub.platform.dto.GitlabCodeStructureGraphNodeSummary;
import com.aiclub.platform.dto.GitlabCodeStructureOverviewCardSummary;
import com.aiclub.platform.dto.GitlabCodeStructureProcessSummary;
import com.aiclub.platform.dto.GitlabCodeStructureQueryResult;
import com.aiclub.platform.dto.GitlabCodeStructureRefreshAcceptedResult;
import com.aiclub.platform.dto.GitlabCodeStructureSnapshotSummary;
import com.aiclub.platform.dto.GitlabCreateMergeRequestResult;
import com.aiclub.platform.dto.GitlabGitnexusLaunchResult;
import com.aiclub.platform.dto.GitlabMergeRequestSummary;
import com.aiclub.platform.dto.GitlabProductBranchSummary;
import com.aiclub.platform.dto.GitlabProductBranchSyncLogSummary;
import com.aiclub.platform.dto.GitlabProductBranchSyncRunItem;
import com.aiclub.platform.dto.GitlabProductBranchSyncRunResult;
import com.aiclub.platform.dto.GitlabTagCreateResult;
import com.aiclub.platform.dto.GitlabUserSummary;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.ProjectGitlabBindingSummary;
import com.aiclub.platform.dto.RepositoryScanRulesetSummary;
import com.aiclub.platform.dto.request.GitlabAutoMergeConfigRequest;
import com.aiclub.platform.dto.request.GitlabAutoMergePipelineTargetRequest;
import com.aiclub.platform.dto.request.GitlabAutoMergeProjectShareRequest;
import com.aiclub.platform.dto.request.GitlabAutoMergeWebhookRequest;
import com.aiclub.platform.dto.request.GitlabAutoMergeLogIssueFeedbackRequest;
import com.aiclub.platform.dto.request.GitlabCreateProductBranchSyncRequest;
import com.aiclub.platform.dto.request.GitlabBindingScanTaskRequest;
import com.aiclub.platform.dto.request.CreateExecutionTaskRequest;
import com.aiclub.platform.dto.request.GitlabCodeStructureQueryRequest;
import com.aiclub.platform.dto.request.GitlabCodeStructureRefreshRequest;
import com.aiclub.platform.dto.request.GitlabCreateMergeRequestRequest;
import com.aiclub.platform.dto.request.GitlabGitnexusLaunchRequest;
import com.aiclub.platform.dto.request.GitlabProductBranchRequest;
import com.aiclub.platform.dto.request.GitlabTagCreateRequest;
import com.aiclub.platform.dto.request.ProjectGitlabBindingRequest;
import com.aiclub.platform.repository.AiModelConfigRepository;
import com.aiclub.platform.repository.AiClubPipelineRepository;
import com.aiclub.platform.repository.ProjectPipelineBindingRepository;
import com.aiclub.platform.repository.AgentRepository;
import com.aiclub.platform.repository.GitlabAutoMergeConfigRepository;
import com.aiclub.platform.repository.GitlabAutoMergePipelineTargetRepository;
import com.aiclub.platform.repository.GitlabAutoMergeWebhookRepository;
import com.aiclub.platform.repository.GitlabCodeStructureSnapshotRepository;
import com.aiclub.platform.repository.GitlabAutoMergeLogRepository;
import com.aiclub.platform.repository.GitlabAutoMergeLogIssueFeedbackRepository;
import com.aiclub.platform.repository.GitlabAutoMergeProjectShareRepository;
import com.aiclub.platform.repository.GitlabProductBranchRepository;
import com.aiclub.platform.repository.GitlabProductBranchSyncLogRepository;
import com.aiclub.platform.repository.ProjectGitlabBindingRepository;
import com.aiclub.platform.repository.ProjectRepository;
import com.aiclub.platform.security.AuthContextHolder;
import jakarta.persistence.criteria.JoinType;
import jakarta.persistence.criteria.Predicate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.scheduling.support.CronExpression;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.Executor;

@Service
@Transactional(readOnly = true)
public class GitlabManagementService {

    private static final Logger log = LoggerFactory.getLogger(GitlabManagementService.class);
    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final String MODE_PROJECT_BOUND = "PROJECT_BOUND";
    private static final String MODE_STANDALONE = "STANDALONE";
    private static final String REVIEW_STRICTNESS_HIGH = "HIGH";
    private static final String REVIEW_STRICTNESS_MEDIUM = "MEDIUM";
    private static final String REVIEW_STRICTNESS_LOW = "LOW";
    private static final String TRIGGER_MANUAL = "MANUAL";
    private static final String TRIGGER_SCHEDULED = "SCHEDULED";
    private static final String CREDIT_FEATURE_AUTO_MERGE = "AUTO_MERGE";
    private static final String BRANCH_BEHIND_REASON_PREFIX = "源分支落后于目标分支";
    private static final String REVIEW_FINGERPRINT_SOURCE_SHA = "SHA";
    private static final String REVIEW_FINGERPRINT_SOURCE_DIFF = "DIFF";
    private static final String AUTO_MERGE_TARGET_AI_CLUB = "AI_CLUB";
    private static final String AUTO_MERGE_TARGET_JENKINS = "JENKINS";
    private static final String PRODUCT_BRANCH_RESULT_CREATED = "CREATED";
    private static final String PRODUCT_BRANCH_RESULT_NO_CHANGE = "NO_CHANGE";
    private static final String PRODUCT_BRANCH_RESULT_EXISTING_OPEN_MR = "EXISTING_OPEN_MR";
    private static final String PRODUCT_BRANCH_RESULT_FAILED = "FAILED";
    private static final String CODE_STRUCTURE_STATUS_NOT_BUILT = "NOT_BUILT";
    private static final String CODE_STRUCTURE_STATUS_BUILDING = "BUILDING";
    private static final String CODE_STRUCTURE_STATUS_READY = "READY";
    private static final String CODE_STRUCTURE_STATUS_DEGRADED = "DEGRADED";
    private static final String CODE_STRUCTURE_STATUS_FAILED = "FAILED";
    private static final String DEFAULT_CODE_STRUCTURE_BRANCH = "main";
    private static final char[] TOKEN_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz".toCharArray();
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private final ProjectRepository projectRepository;
    private final AgentRepository agentRepository;
    private final ProjectGitlabBindingRepository bindingRepository;
    private final GitlabCodeStructureSnapshotRepository codeStructureSnapshotRepository;
    private final GitlabAutoMergeConfigRepository autoMergeConfigRepository;
    private final GitlabAutoMergePipelineTargetRepository autoMergePipelineTargetRepository;
    private final GitlabAutoMergeLogRepository autoMergeLogRepository;
    private final GitlabAutoMergeLogIssueFeedbackRepository autoMergeLogIssueFeedbackRepository;
    private final GitlabAutoMergeProjectShareRepository autoMergeProjectShareRepository;
    private final GitlabAutoMergeWebhookRepository autoMergeWebhookRepository;
    private final AiClubPipelineRepository aiClubPipelineRepository;
    private final ProjectPipelineBindingRepository projectPipelineBindingRepository;
    private final GitlabProductBranchRepository productBranchRepository;
    private final GitlabProductBranchSyncLogRepository productBranchSyncLogRepository;
    private final AiModelConfigRepository aiModelConfigRepository;
    private final GitlabApiService gitlabApiService;
    private final TokenCipherService tokenCipherService;
    private final ModelConfigService modelConfigService;
    private final CodeReviewClientService codeReviewClientService;
    private final AgentExecutionService agentExecutionService;
    private final CicdManagementService cicdManagementService;
    private final NotificationService notificationService;
    private final GitlabAutoMergeWebhookDispatcher autoMergeWebhookDispatcher;
    private final CreditConsumptionService creditConsumptionService;
    private final ProjectDataPermissionService projectDataPermissionService;
    private final GitlabUserOauthService gitlabUserOauthService;
    private final ExecutionTaskService executionTaskService;
    private final RepositoryScanClientService repositoryScanClientService;
    private final RepositoryScanRulesetService repositoryScanRulesetService;
    private final GitlabCodeStructureClientService gitlabCodeStructureClientService;
    private final GitnexusProperties gitnexusProperties;
    private final PlatformEnvVarResolver platformEnvVarResolver;
    private final ObjectMapper objectMapper;
    private final String defaultApiUrl;
    private final String publicBaseUrl;
    private final Executor executionTaskExecutor;
    private final TransactionTemplate requiresNewTransactionTemplate;

    public GitlabManagementService(ProjectRepository projectRepository,
                                   ProjectGitlabBindingRepository bindingRepository,
                                   GitlabCodeStructureSnapshotRepository codeStructureSnapshotRepository,
                                   GitlabAutoMergeConfigRepository autoMergeConfigRepository,
                                   GitlabAutoMergePipelineTargetRepository autoMergePipelineTargetRepository,
                                   GitlabAutoMergeLogRepository autoMergeLogRepository,
                                   GitlabAutoMergeLogIssueFeedbackRepository autoMergeLogIssueFeedbackRepository,
                                   GitlabAutoMergeProjectShareRepository autoMergeProjectShareRepository,
                                   GitlabAutoMergeWebhookRepository autoMergeWebhookRepository,
                                   AiClubPipelineRepository aiClubPipelineRepository,
                                   ProjectPipelineBindingRepository projectPipelineBindingRepository,
                                   GitlabProductBranchRepository productBranchRepository,
                                   GitlabProductBranchSyncLogRepository productBranchSyncLogRepository,
                                   AiModelConfigRepository aiModelConfigRepository,
                                   AgentRepository agentRepository,
                                   GitlabApiService gitlabApiService,
                                   TokenCipherService tokenCipherService,
                                   ModelConfigService modelConfigService,
                                   CodeReviewClientService codeReviewClientService,
                                   AgentExecutionService agentExecutionService,
                                   CicdManagementService cicdManagementService,
                                   NotificationService notificationService,
                                   GitlabAutoMergeWebhookDispatcher autoMergeWebhookDispatcher,
                                   CreditConsumptionService creditConsumptionService,
                                   ProjectDataPermissionService projectDataPermissionService,
                                   GitlabUserOauthService gitlabUserOauthService,
                                   ExecutionTaskService executionTaskService,
                                   RepositoryScanClientService repositoryScanClientService,
                                   RepositoryScanRulesetService repositoryScanRulesetService,
                                   GitlabCodeStructureClientService gitlabCodeStructureClientService,
                                   GitnexusProperties gitnexusProperties,
                                   PlatformEnvVarResolver platformEnvVarResolver,
                                   ObjectMapper objectMapper,
                                   @Value("${platform.gitlab.default-api-url}") String defaultApiUrl,
                                   @Value("${platform.frontend.public-base-url:}") String publicBaseUrl,
                                   PlatformTransactionManager transactionManager,
                                   @Qualifier("executionTaskExecutor") Executor executionTaskExecutor) {
        this.projectRepository = projectRepository;
        this.agentRepository = agentRepository;
        this.bindingRepository = bindingRepository;
        this.codeStructureSnapshotRepository = codeStructureSnapshotRepository;
        this.autoMergeConfigRepository = autoMergeConfigRepository;
        this.autoMergePipelineTargetRepository = autoMergePipelineTargetRepository;
        this.autoMergeLogRepository = autoMergeLogRepository;
        this.autoMergeLogIssueFeedbackRepository = autoMergeLogIssueFeedbackRepository;
        this.autoMergeProjectShareRepository = autoMergeProjectShareRepository;
        this.autoMergeWebhookRepository = autoMergeWebhookRepository;
        this.aiClubPipelineRepository = aiClubPipelineRepository;
        this.projectPipelineBindingRepository = projectPipelineBindingRepository;
        this.productBranchRepository = productBranchRepository;
        this.productBranchSyncLogRepository = productBranchSyncLogRepository;
        this.aiModelConfigRepository = aiModelConfigRepository;
        this.gitlabApiService = gitlabApiService;
        this.tokenCipherService = tokenCipherService;
        this.modelConfigService = modelConfigService;
        this.codeReviewClientService = codeReviewClientService;
        this.agentExecutionService = agentExecutionService;
        this.cicdManagementService = cicdManagementService;
        this.notificationService = notificationService;
        this.autoMergeWebhookDispatcher = autoMergeWebhookDispatcher;
        this.creditConsumptionService = creditConsumptionService;
        this.projectDataPermissionService = projectDataPermissionService;
        this.gitlabUserOauthService = gitlabUserOauthService;
        this.executionTaskService = executionTaskService;
        this.repositoryScanClientService = repositoryScanClientService;
        this.repositoryScanRulesetService = repositoryScanRulesetService;
        this.gitlabCodeStructureClientService = gitlabCodeStructureClientService;
        this.gitnexusProperties = gitnexusProperties;
        this.platformEnvVarResolver = platformEnvVarResolver;
        this.objectMapper = objectMapper;
        this.defaultApiUrl = defaultApiUrl;
        this.publicBaseUrl = trimTrailingSlash(publicBaseUrl);
        this.executionTaskExecutor = executionTaskExecutor;
        this.requiresNewTransactionTemplate = new TransactionTemplate(transactionManager);
        this.requiresNewTransactionTemplate.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
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
        entity.setProductMainBranch(trimToNull(request.productMainBranch()));
        entity.setTestProfileJson(normalizeJsonText(request.testProfileJson()));
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
        entity.setProductMainBranch(trimToNull(request.productMainBranch()));
        validateProductMainBranch(entity);
        entity.setTestProfileJson(normalizeJsonText(request.testProfileJson()));
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
            if (!hasText(entity.getProductMainBranch()) && hasText(project.defaultBranch())) {
                entity.setProductMainBranch(project.defaultBranch());
            }
            validateProductMainBranch(entity);
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
                false,
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
     * 用户管理绑定 GitLab 账号时，从已启用的仓库绑定中复用一份可用凭据读取远端用户候选。
     */
    public List<GitlabUserSummary> listGitlabUsers(String keyword) {
        ProjectGitlabBindingEntity binding = bindingRepository.findAll(Sort.by(Sort.Direction.ASC, "id")).stream()
                .filter(item -> Boolean.TRUE.equals(item.getEnabled()))
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("请先在 GitLab 管理中创建并启用一个仓库绑定"));
        String token = tokenCipherService.decrypt(binding.getTokenCiphertext());
        return gitlabApiService.listUsers(binding.getApiBaseUrl(), token, keyword).stream()
                .map(item -> new GitlabUserSummary(
                        item.id(),
                        item.username(),
                        item.name(),
                        item.email(),
                        item.avatarUrl(),
                        item.webUrl()
                ))
                .toList();
    }

    /**
     * 读取绑定仓库的代码结构快照。
     * 页面打开时优先展示最近一次快照，不阻塞用户等待新的 GitNexus 分析完成。
     */
    public GitlabCodeStructureSnapshotSummary getBindingCodeStructure(Long bindingId, String branch) {
        ProjectGitlabBindingEntity binding = requireBinding(bindingId);
        projectDataPermissionService.requireGitlabBindingVisible(binding);
        String resolvedBranch = resolveCodeStructureBranch(binding, branch);
        GitlabCodeStructureSnapshotEntity snapshot = codeStructureSnapshotRepository.findByBinding_IdAndBranchName(bindingId, resolvedBranch)
                .orElse(null);
        return toCodeStructureSnapshotSummary(binding, snapshot, resolvedBranch);
    }

    /**
     * 后台刷新绑定仓库的代码结构快照。
     * 刷新入口只负责把状态切到 BUILDING 并投递后台任务，不同步等待 code-processing 完成。
     */
    @Transactional
    public GitlabCodeStructureRefreshAcceptedResult refreshBindingCodeStructure(Long bindingId,
                                                                                GitlabCodeStructureRefreshRequest request) {
        ProjectGitlabBindingEntity binding = requireBinding(bindingId);
        projectDataPermissionService.requireGitlabBindingVisible(binding);
        requireCodeStructureRefreshable(binding);
        String resolvedBranch = resolveCodeStructureBranch(binding, request == null ? null : request.branch());
        GitlabCodeStructureSnapshotEntity snapshot = codeStructureSnapshotRepository.findByBinding_IdAndBranchName(bindingId, resolvedBranch)
                .orElseGet(() -> {
                    GitlabCodeStructureSnapshotEntity entity = new GitlabCodeStructureSnapshotEntity();
                    entity.setBinding(binding);
                    entity.setBranchName(resolvedBranch);
                    entity.setStatus(CODE_STRUCTURE_STATUS_NOT_BUILT);
                    return entity;
                });
        if (CODE_STRUCTURE_STATUS_BUILDING.equalsIgnoreCase(defaultString(snapshot.getStatus()))) {
            return toCodeStructureRefreshAcceptedResult(snapshot, false);
        }
        snapshot.setStatus(CODE_STRUCTURE_STATUS_BUILDING);
        snapshot.setRefreshStartedAt(LocalDateTime.now());
        snapshot.setRefreshFinishedAt(null);
        snapshot.setLastErrorMessage(null);
        GitlabCodeStructureSnapshotEntity savedSnapshot = codeStructureSnapshotRepository.save(snapshot);
        GitlabCodeStructureClientService.StructureRepository repository = buildCodeStructureRepository(binding, resolvedBranch);
        executionTaskExecutor.execute(() -> runCodeStructureRefresh(savedSnapshot.getId(), repository));
        return toCodeStructureRefreshAcceptedResult(savedSnapshot, true);
    }

    /**
     * 基于已缓存的 GitNexus 索引执行局部查询。
     * 查询结果只返回给当前页面，不写入仓库快照表。
     */
    public GitlabCodeStructureQueryResult queryBindingCodeStructure(Long bindingId,
                                                                    GitlabCodeStructureQueryRequest request) {
        ProjectGitlabBindingEntity binding = requireBinding(bindingId);
        projectDataPermissionService.requireGitlabBindingVisible(binding);
        String branch = trimToNull(request.branch());
        String query = trimToNull(request.query());
        if (branch == null) {
            throw new IllegalArgumentException("查询分支不能为空");
        }
        if (query == null || query.length() < 2) {
            throw new IllegalArgumentException("查询关键词长度需至少为 2");
        }
        GitlabCodeStructureSnapshotEntity snapshot = codeStructureSnapshotRepository.findByBinding_IdAndBranchName(bindingId, branch)
                .orElseThrow(() -> new IllegalArgumentException("当前分支尚未生成结构化快照，请先刷新"));
        if (!hasText(snapshot.getOverviewJson()) || !hasText(snapshot.getGraphJson())) {
            throw new IllegalArgumentException("当前分支暂无可查询的结构化快照，请先刷新");
        }
        GitlabCodeStructureClientService.QueryStructureResponse response = gitlabCodeStructureClientService.queryStructure(
                new GitlabCodeStructureClientService.QueryStructureRequest(
                        buildCodeStructureRepository(binding, branch),
                        query
                )
        );
        return toCodeStructureQueryResult(response);
    }

    /**
     * 为前端准备 GitNexus 全仓图跳转上下文。
     * 平台负责确保目标分支已 analyze 且 serve 已运行，前端只消费最终 launch URL。
     */
    public GitlabGitnexusLaunchResult launchBindingGitnexus(Long bindingId,
                                                            GitlabGitnexusLaunchRequest request,
                                                            String requestScheme,
                                                            String requestHost) {
        if (!gitnexusProperties.isEnabled()) {
            throw new IllegalStateException("当前环境未启用 GitNexus 全仓图能力");
        }
        ProjectGitlabBindingEntity binding = requireBinding(bindingId);
        projectDataPermissionService.requireGitlabBindingVisible(binding);
        requireCodeStructureRefreshable(binding);
        String resolvedBranch = resolveCodeStructureBranch(binding, request == null ? null : request.branch());
        GitlabCodeStructureClientService.StructureRepository repository = buildCodeStructureRepository(binding, resolvedBranch);
        GitlabCodeStructureClientService.LaunchContextResponse response = gitlabCodeStructureClientService.buildLaunchContext(
                new GitlabCodeStructureClientService.LaunchContextRequest(repository)
        );
        String repoAlias = trimToNull(response.repoAlias());
        if (repoAlias == null) {
            throw new IllegalStateException("GitNexus analyze 已完成，但无法解析当前仓库的 repo alias。");
        }
        String gitnexusUiUrl = gitnexusProperties.resolveUiPublicBaseUrl(requestScheme, requestHost);
        String gitnexusServerUrl = gitnexusProperties.resolveServePublicBaseUrl(requestScheme, requestHost);
        String launchUrl = gitnexusUiUrl
                + "/?project="
                + URLEncoder.encode(repoAlias, StandardCharsets.UTF_8)
                + "&server="
                + URLEncoder.encode(gitnexusServerUrl, StandardCharsets.UTF_8);
        return new GitlabGitnexusLaunchResult(
                defaultString(response.branchName()),
                defaultString(response.commitSha()),
                repoAlias,
                gitnexusUiUrl,
                gitnexusServerUrl,
                launchUrl,
                Boolean.TRUE.equals(response.serveReady())
        );
    }

    /**
     * 查询指定绑定仓库下的产品分线，并补充主线差异和开放同步 MR 状态。
     */
    public List<GitlabProductBranchSummary> listProductBranches(Long bindingId) {
        ProjectGitlabBindingEntity binding = requireBinding(bindingId);
        List<GitlabProductBranchEntity> branches = productBranchRepository.findAllByBinding_IdOrderByIdAsc(binding.getId());
        if (branches.isEmpty()) {
            return List.of();
        }
        String productMainBranch = trimToNull(binding.getProductMainBranch());
        if (!hasText(productMainBranch)) {
            return branches.stream()
                    .map(branch -> toProductBranchSummary(branch, 0, false, null))
                    .toList();
        }
        ResolvedGitlabConfig resolved = resolveBindingConfig(binding);
        List<GitlabProductBranchSummary> summaries = new ArrayList<>();
        for (GitlabProductBranchEntity branch : branches) {
            GitlabApiService.GitlabCompareResult compareResult = gitlabApiService.compareBranches(
                    resolved.apiBaseUrl(),
                    resolved.token(),
                    resolved.projectRef(),
                    branch.getBranchName(),
                    productMainBranch
            );
            List<GitlabApiService.GitlabMergeRequest> openMergeRequests = gitlabApiService.listMergeRequests(
                    resolved.apiBaseUrl(),
                    resolved.token(),
                    resolved.projectRef(),
                    "opened",
                    productMainBranch,
                    branch.getBranchName()
            );
            GitlabApiService.GitlabMergeRequest openMergeRequest = openMergeRequests.isEmpty() ? null : openMergeRequests.get(0);
            boolean hasDiffWithMainline = !compareResult.sameRef() && !compareResult.commitIds().isEmpty();
            summaries.add(toProductBranchSummary(branch, compareResult.commitIds().size(), hasDiffWithMainline, openMergeRequest));
        }
        return summaries;
    }

    /**
     * 创建绑定仓库下的一条产品分线定义。
     */
    @Transactional
    public GitlabProductBranchSummary createProductBranch(Long bindingId, GitlabProductBranchRequest request) {
        ProjectGitlabBindingEntity binding = requireBinding(bindingId);
        String lineCode = requireValue(request.lineCode(), "产品线编码");
        String lineName = requireValue(request.lineName(), "产品线名称");
        String branchName = requireValue(request.branchName(), "分线分支");
        validateProductBranchRequest(binding, lineCode, branchName, null);
        GitlabProductBranchEntity entity = new GitlabProductBranchEntity();
        entity.setBinding(binding);
        entity.setLineCode(lineCode);
        entity.setLineName(lineName);
        entity.setBranchName(branchName);
        entity.setEnabled(defaultBoolean(request.enabled(), true));
        return toProductBranchSummary(productBranchRepository.save(entity), 0, false, null);
    }

    /**
     * 更新指定产品分线定义。
     */
    @Transactional
    public GitlabProductBranchSummary updateProductBranch(Long bindingId, Long productBranchId, GitlabProductBranchRequest request) {
        ProjectGitlabBindingEntity binding = requireBinding(bindingId);
        GitlabProductBranchEntity entity = requireProductBranch(binding, productBranchId);
        String lineCode = requireValue(request.lineCode(), "产品线编码");
        String lineName = requireValue(request.lineName(), "产品线名称");
        String branchName = requireValue(request.branchName(), "分线分支");
        validateProductBranchRequest(binding, lineCode, branchName, entity.getId());
        entity.setLineCode(lineCode);
        entity.setLineName(lineName);
        entity.setBranchName(branchName);
        entity.setEnabled(defaultBoolean(request.enabled(), true));
        return toProductBranchSummary(productBranchRepository.save(entity), 0, false, null);
    }

    /**
     * 删除产品分线定义，历史同步日志通过快照字段继续保留。
     */
    @Transactional
    public void deleteProductBranch(Long bindingId, Long productBranchId) {
        ProjectGitlabBindingEntity binding = requireBinding(bindingId);
        productBranchRepository.delete(requireProductBranch(binding, productBranchId));
    }

    /**
     * 查询绑定仓库下的产品分线同步日志。
     */
    public List<GitlabProductBranchSyncLogSummary> listProductBranchSyncLogs(Long bindingId) {
        requireBinding(bindingId);
        return productBranchSyncLogRepository.findAllByBinding_IdOrderByExecutedAtDescIdDesc(bindingId).stream()
                .map(this::toProductBranchSyncLogSummary)
                .toList();
    }

    /**
     * 按指定产品分线批量创建“主线 -> 分线”的同步 Merge Request。
     */
    public GitlabProductBranchSyncRunResult createProductBranchSyncMergeRequests(Long bindingId,
                                                                                 GitlabCreateProductBranchSyncRequest request) {
        ProjectGitlabBindingEntity binding = requireBinding(bindingId);
        String productMainBranch = requireProductMainBranch(binding);
        GitlabUserOauthService.CurrentGitlabOauthAccess oauthAccess = gitlabUserOauthService.requireCurrentUserAccess(binding.getApiBaseUrl());
        String projectRef = resolveBindingProjectRef(binding);
        List<Long> requestedIds = request.productBranchIds().stream()
                .filter(id -> id != null)
                .distinct()
                .toList();
        if (requestedIds.isEmpty()) {
            throw new IllegalArgumentException("至少选择一个产品分线");
        }

        LinkedHashMap<Long, GitlabProductBranchEntity> branchMap = new LinkedHashMap<>();
        for (GitlabProductBranchEntity branch : productBranchRepository.findAllByBinding_IdOrderByIdAsc(bindingId)) {
            branchMap.put(branch.getId(), branch);
        }

        List<GitlabProductBranchEntity> targets = new ArrayList<>();
        for (Long branchId : requestedIds) {
            GitlabProductBranchEntity branch = branchMap.get(branchId);
            if (branch == null) {
                throw new NoSuchElementException("产品分线不存在: " + branchId);
            }
            targets.add(branch);
        }

        LocalDateTime executedAt = LocalDateTime.now();
        List<GitlabProductBranchSyncRunItem> items = new ArrayList<>();
        int createdCount = 0;
        int noChangeCount = 0;
        int existingOpenMrCount = 0;
        int failedCount = 0;
        for (GitlabProductBranchEntity branch : targets) {
            ProductBranchSyncExecution execution = executeProductBranchSync(
                    binding,
                    projectRef,
                    productMainBranch,
                    oauthAccess.authorization(),
                    branch,
                    executedAt
            );
            items.add(execution.item());
            switch (execution.result()) {
                case PRODUCT_BRANCH_RESULT_CREATED -> createdCount++;
                case PRODUCT_BRANCH_RESULT_NO_CHANGE -> noChangeCount++;
                case PRODUCT_BRANCH_RESULT_EXISTING_OPEN_MR -> existingOpenMrCount++;
                default -> failedCount++;
            }
        }
        return new GitlabProductBranchSyncRunResult(
                binding.getId(),
                binding.getProject().getName(),
                productMainBranch,
                targets.size(),
                createdCount,
                noChangeCount,
                existingOpenMrCount,
                failedCount,
                items
        );
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

    public GitlabAutoMergeProjectShareSummary getProjectAutoMergeShare(Long projectId) {
        ProjectEntity project = requireVisibleProject(projectId);
        return toProjectAutoMergeShareSummary(project, autoMergeProjectShareRepository.findByProject_Id(projectId).orElse(null));
    }

    @Transactional
    public GitlabAutoMergeProjectShareSummary createOrRefreshProjectAutoMergeShare(Long projectId,
                                                                                   GitlabAutoMergeProjectShareRequest request) {
        ProjectEntity project = requireVisibleProject(projectId);
        GitlabAutoMergeProjectShareEntity entity = autoMergeProjectShareRepository.findByProject_Id(projectId)
                .orElseGet(() -> {
                    GitlabAutoMergeProjectShareEntity created = new GitlabAutoMergeProjectShareEntity();
                    created.setProject(project);
                    return created;
                });
        String token = generateShareToken();
        entity.setTokenCiphertext(tokenCipherService.encrypt(token));
        if (Boolean.TRUE.equals(request.permanent())) {
            entity.setExpiresAt(null);
        } else {
            Integer expiresInDays = request.expiresInDays();
            if (expiresInDays == null) {
                throw new IllegalArgumentException("请选择分享有效天数，或开启永久有效");
            }
            entity.setExpiresAt(LocalDateTime.now().plusDays(expiresInDays));
        }
        entity.setEnabled(true);
        autoMergeProjectShareRepository.save(entity);
        return toProjectAutoMergeShareSummary(project, entity);
    }

    @Transactional
    public void disableProjectAutoMergeShare(Long projectId) {
        ProjectEntity project = requireVisibleProject(projectId);
        GitlabAutoMergeProjectShareEntity entity = autoMergeProjectShareRepository.findByProject_Id(project.getId())
                .orElseThrow(() -> new NoSuchElementException("当前项目尚未创建自动合并日志分享链接"));
        entity.setEnabled(false);
        autoMergeProjectShareRepository.save(entity);
    }

    public GitlabAutoMergePublicLogPage pageProjectAutoMergeLogsByShare(Long projectId,
                                                                        String token,
                                                                        int page,
                                                                        int size,
                                                                        String result) {
        ProjectEntity project = requireValidProjectShare(projectId, token);
        Pageable pageable = buildPageable(page, size, Sort.by(Sort.Direction.DESC, "executedAt", "id"));
        Page<GitlabAutoMergeLogSummary> pageData = autoMergeLogRepository.findAll(publicAutoMergeLogSpecification(projectId, result), pageable)
                .map(this::toAutoMergeLogSummary);
        return new GitlabAutoMergePublicLogPage(projectId, project.getName(), resolveProjectNextMergeAt(projectId), PageResponse.from(pageData));
    }

    // ========================================================================
    //  审查问题逐条反馈
    // ========================================================================

    /**
     * 分享页提交对某条 AI 审查问题的逐条反馈。
     *
     * <p>流程：</p>
     * <ol>
     *     <li>校验 share token 有效</li>
     *     <li>校验 logId 归属于该 project</li>
     *     <li>校验 issueId + section 有效，且在 detailMarkdown 中存在</li>
     *     <li>对前端指纹做服务端二次哈希 (SHA-256(fp + salt)) 后入库</li>
     *     <li>按 (logId, issueId, fingerprintHash) 唯一 upsert：已存在则覆盖（允许同来源改评价）</li>
     * </ol>
     */
    @Transactional
    public GitlabAutoMergeLogIssueFeedbackSummary submitIssueFeedback(
            Long projectId,
            String token,
            Long logId,
            GitlabAutoMergeLogIssueFeedbackRequest request,
            String clientIp,
            String userAgent) {
        // 1. 校验分享链接
        requireValidProjectShare(projectId, token);

        // 2. 校验日志归属
        GitlabAutoMergeLogEntity log = autoMergeLogRepository.findById(logId)
                .orElseThrow(() -> new NoSuchElementException("日志不存在: " + logId));
        if (log.getProject() == null || !log.getProject().getId().equals(projectId)) {
            throw new IllegalArgumentException("该日志不属于当前项目");
        }

        // 3. 校验请求参数
        String issueId = trimToNull(request.getIssueId());
        String verdict = trimToNull(request.getVerdict());
        String reason = trimToNull(request.getReason());
        String clientFingerprint = trimToNull(request.getFingerprint());
        String section = trimToNull(request.getSection());

        if (issueId == null) {
            throw new IllegalArgumentException("issueId 不能为空");
        }
        if (!"CORRECT".equalsIgnoreCase(verdict) && !"INCORRECT".equalsIgnoreCase(verdict)) {
            throw new IllegalArgumentException("verdict 仅允许 CORRECT 或 INCORRECT");
        }
        if (!"NEWLY_RAISED".equalsIgnoreCase(section) && !"PENDING".equalsIgnoreCase(section)) {
            throw new IllegalArgumentException("section 仅允许 NEWLY_RAISED 或 PENDING");
        }
        if (reason != null && reason.length() > 2000) {
            throw new IllegalArgumentException("反馈理由最长 2000 字符");
        }
        if (clientFingerprint == null || clientFingerprint.length() < 8) {
            throw new IllegalArgumentException("缺少有效的客户端指纹");
        }

        // 4. 验证 issueId 确实属于该 log 的 detailMarkdown
        validateIssueIdBelongsToLog(log, issueId);

        // 5. 服务端指纹再哈希
        String fingerPrintSalt = "aiclub-feedback-salt"; // TODO: 后续按需抽取到配置
        String serverFingerprintHash = hashText(clientFingerprint + fingerPrintSalt);

        // 6. IP 哈希（仅用于流量回溯，不存明文的 IP）
        String ipHash = hasText(clientIp) ? hashText(clientIp + fingerPrintSalt) : null;

        // 7. 查找已有反馈做 upsert
        GitlabAutoMergeLogIssueFeedbackEntity entity = autoMergeLogIssueFeedbackRepository
                .findByLog_IdAndIssueIdAndSubmitterFingerprintHash(logId, issueId, serverFingerprintHash)
                .orElseGet(() -> {
                    GitlabAutoMergeLogIssueFeedbackEntity created = new GitlabAutoMergeLogIssueFeedbackEntity();
                    created.setLog(log);
                    created.setProjectId(projectId);
                    created.setConfigId(log.getConfig() == null ? null : log.getConfig().getId());
                    created.setIssueId(issueId);
                    created.setSubmitterFingerprintHash(serverFingerprintHash);
                    return created;
                });

        // 从 issue_id 找到当时渲染的文本快照（用于给 LLM 复盘时还原反馈上下文）
        String issueTextSnapshot = resolveIssueTextSnapshot(log, issueId);
        entity.setIssueTextSnapshot(issueTextSnapshot != null ? issueTextSnapshot : "");
        entity.setSection(section.toUpperCase());
        entity.setVerdict(verdict.toUpperCase());
        entity.setReason(reason);
        entity.setSubmitterIpHash(ipHash);
        entity.setUserAgent(limitLength(userAgent, 512));
        entity.setReviewResultSnapshot(log.getResult());
        autoMergeLogIssueFeedbackRepository.save(entity);

        return toIssueFeedbackSummary(entity);
    }

    /**
     * 分享页打开详情时，按当前指纹拉取该日志的全部已有反馈，前端按 issueId 回填。
     */
    public List<GitlabAutoMergeLogIssueFeedbackSummary> listIssueFeedbackByLog(
            Long projectId, String token, Long logId, String fingerprint) {
        requireValidProjectShare(projectId, token);
        if (!hasText(fingerprint) || fingerprint.length() < 8) {
            return List.of();
        }
        String fingerPrintSalt = "aiclub-feedback-salt";
        String serverFingerprintHash = hashText(fingerprint + fingerPrintSalt);
        return autoMergeLogIssueFeedbackRepository
                .findAllByLog_IdAndSubmitterFingerprintHashOrderByIssueIdAsc(logId, serverFingerprintHash)
                .stream()
                .map(this::toIssueFeedbackSummary)
                .toList();
    }

    /**
     * (预留) 未来 LLM 复盘智能体接口：查询项目的反馈抽样。
     *
     * <p>TODO: 本期不暴露 Controller，复盘智能体需要时再按需暴露。
     * 按 issueId 汇总全项目下所有 INCORRECT 反馈，提供给 LLM 分析失败模式。</p>
     */
    public List<GitlabAutoMergeLogIssueFeedbackSummary> listFeedbackForReview(
            Long projectId, String issueId) {
        return autoMergeLogIssueFeedbackRepository
                .findAllByProjectIdAndIssueIdOrderByCreatedAtDesc(projectId, issueId)
                .stream()
                .map(this::toIssueFeedbackSummary)
                .toList();
    }

    /**
     * 校验传入的 issueId 是否确实存在于该日志的 detailMarkdown 中，
     * 防止恶意客户端提交不存在的 issueId。
     */
    private void validateIssueIdBelongsToLog(GitlabAutoMergeLogEntity log, String issueId) {
        String markdown = trimToNull(log.getDetailMarkdown());
        if (markdown == null) {
            throw new IllegalArgumentException("该日志没有 markdown 详情，无法提交反馈");
        }
        // issue-id 在 markdown 中是以 HTML 注释出现的：<!-- issue-id: xxx -->
        if (!markdown.contains("<!-- issue-id: " + issueId + " -->")) {
            throw new IllegalArgumentException("issueId " + issueId + " 不存在于该日志的详情中");
        }
    }

    /**
     * 从 detailMarkdown 中提取一条 issue 文本快照（即 bullet 内容，不含注释）。
     * 查找逻辑：找到包含对应 issueId 注释的 bullet，提取其前面的文本。
     */
    private String resolveIssueTextSnapshot(GitlabAutoMergeLogEntity log, String issueId) {
        String markdown = trimToNull(log.getDetailMarkdown());
        if (markdown == null) {
            return null;
        }
        // 按行查找，寻找包含 <!-- issue-id: xxx --> 的那一行
        String targetMarker = "<!-- issue-id: " + issueId + " -->";
        for (String line : markdown.split("\\R")) {
            if (line.contains(targetMarker)) {
                // 去掉注释标记和前导 - ，取纯文本
                String text = line.replace(targetMarker, "").replaceAll("^-\\s*", "").trim();
                return hasText(text) ? text : line.trim();
            }
        }
        return null;
    }

    private GitlabAutoMergeLogIssueFeedbackSummary toIssueFeedbackSummary(GitlabAutoMergeLogIssueFeedbackEntity entity) {
        return new GitlabAutoMergeLogIssueFeedbackSummary(
                entity.getId(),
                entity.getLog() == null ? null : entity.getLog().getId(),
                entity.getIssueId(),
                entity.getIssueTextSnapshot(),
                entity.getSection(),
                entity.getVerdict(),
                entity.getReason(),
                formatTime(entity.getCreatedAt()),
                formatTime(entity.getUpdatedAt())
        );
    }

    private String limitLength(String value, int max) {
        if (value == null) return null;
        return value.length() > max ? value.substring(0, max) : value;
    }

    /**
     * 计算该项目下「下次自动合并时间」：取所有 PROJECT_BOUND、启用了定时调度且 cron 合法的策略中最近一次触发时间。
     *
     * <p>用于只读分享页给外部相关方一个明确的预期；没有任何启用调度的策略时返回 {@code null}。</p>
     */
    private String resolveProjectNextMergeAt(Long projectId) {
        Specification<GitlabAutoMergeConfigEntity> spec = (root, query, cb) -> {
            var binding = root.join("binding", JoinType.LEFT);
            return cb.and(
                    cb.equal(root.get("executionMode"), MODE_PROJECT_BOUND),
                    cb.isTrue(root.get("schedulerEnabled")),
                    cb.equal(binding.join("project", JoinType.LEFT).get("id"), projectId)
            );
        };
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime earliest = null;
        for (GitlabAutoMergeConfigEntity config : autoMergeConfigRepository.findAll(spec)) {
            String cron = trimToNull(config.getSchedulerCron());
            if (cron == null || !CronExpression.isValidExpression(cron)) {
                continue;
            }
            try {
                LocalDateTime next = CronExpression.parse(cron).next(now);
                if (next != null && (earliest == null || next.isBefore(earliest))) {
                    earliest = next;
                }
            } catch (RuntimeException ignored) {
                // 单条 cron 解析异常不影响其它策略
            }
        }
        return earliest == null ? null : formatTime(earliest);
    }

    /**
     * 公开侧：列出该项目下绑定的所有流水线（脱敏摘要）。
     *
     * <p>合并两类来源：</p>
     * <ul>
     *     <li>{@code WOODPECKER}：来自 {@link AiClubPipelineEntity}（AI Club 内置流水线，按 project_id 过滤）</li>
     *     <li>{@code JENKINS}：来自 {@link ProjectPipelineBindingEntity}（项目 Jenkins 绑定，按 project_id 过滤）</li>
     * </ul>
     *
     * <p>返回字段严格白名单，避免泄露 token 等敏感信息；只暴露最近一次状态、时间、外链。</p>
     */
    public List<ProjectPublicPipelineSummary> listPublicPipelinesByShare(Long projectId, String token) {
        requireValidProjectShare(projectId, token);
        List<ProjectPublicPipelineSummary> result = new ArrayList<>();
        for (AiClubPipelineEntity pipeline : aiClubPipelineRepository.findByProject_IdOrderByIdAsc(projectId)) {
            result.add(new ProjectPublicPipelineSummary(
                    pipeline.getId(),
                    "WOODPECKER",
                    pipeline.getName(),
                    trimToNull(pipeline.getDefaultBranch()),
                    trimToNull(pipeline.getLastRunStatus()),
                    formatTime(pipeline.getLastTriggeredAt()),
                    trimToNull(pipeline.getLastRunUrl())
            ));
        }
        for (ProjectPipelineBindingEntity binding : projectPipelineBindingRepository.findByProject_IdOrderByIdAsc(projectId)) {
            result.add(new ProjectPublicPipelineSummary(
                    binding.getId(),
                    "JENKINS",
                    binding.getJobName(),
                    trimToNull(binding.getDefaultBranch()),
                    trimToNull(binding.getLastTriggerStatus()),
                    formatTime(binding.getLastTriggeredAt()),
                    trimToNull(binding.getLastTriggerUrl())
            ));
        }
        return result;
    }

    /**
     * 公开侧：分页查看某条流水线的运行历史，仅暴露摘要字段。
     *
     * <p>底层不入库的 Jenkins 与已落 snapshot 的 Woodpecker 一并支持；外部 CI 调用失败时返回空列表 + warning，避免分享页整体不可用。</p>
     *
     * <p>用 {@code Propagation.NOT_SUPPORTED} 跳出 class 级别的 readOnly 事务上下文：
     * 否则一旦底层 Jenkins/Woodpecker 调用抛 {@link RuntimeException}，即便我们在内部 catch 住，
     * Spring 仍会把外层事务标记为 rollback-only，方法返回时抛 {@code UnexpectedRollbackException}。
     * 这条链路本来就只是读 repository + 调用远程 CI，没有事务需求。</p>
     *
     * @param kind       {@code WOODPECKER} 或 {@code JENKINS}
     * @param pipelineId 对应来源的主键，必须归属当前 {@code projectId}，否则视为越权
     */
    @Transactional(propagation = org.springframework.transaction.annotation.Propagation.NOT_SUPPORTED)
    public ProjectPublicPipelineRunPage pagePublicPipelineRunsByShare(Long projectId,
                                                                      String token,
                                                                      String kind,
                                                                      Long pipelineId,
                                                                      int page,
                                                                      int size) {
        ProjectEntity project = requireValidProjectShare(projectId, token);
        String normalizedKind = trimToNull(kind);
        if (normalizedKind == null) {
            throw new IllegalArgumentException("流水线类型不能为空");
        }
        if (pipelineId == null) {
            throw new IllegalArgumentException("流水线 ID 不能为空");
        }
        int safePage = Math.max(1, page);
        int safeSize = Math.max(1, Math.min(size, 50));
        if ("WOODPECKER".equalsIgnoreCase(normalizedKind)) {
            return loadWoodpeckerPipelineRunsForShare(project, projectId, pipelineId, safePage, safeSize);
        }
        if ("JENKINS".equalsIgnoreCase(normalizedKind)) {
            return loadJenkinsPipelineRunsForShare(project, projectId, pipelineId, safePage, safeSize);
        }
        throw new IllegalArgumentException("不支持的流水线类型: " + kind);
    }

    /**
     * Woodpecker 分支：通过 cicdManagementService 复用底层 API 调用。
     *
     * <p>分享接口为匿名调用，不会附带登录上下文，CicdManagementService 内部的项目可见性校验在
     * {@code currentScopeOrNull()} 为 null 时会直接放行；这里再额外做一次 projectId 归属校验防止越权。</p>
     */
    private ProjectPublicPipelineRunPage loadWoodpeckerPipelineRunsForShare(ProjectEntity project,
                                                                            Long projectId,
                                                                            Long pipelineId,
                                                                            int page,
                                                                            int size) {
        AiClubPipelineEntity pipeline = aiClubPipelineRepository.findById(pipelineId)
                .orElseThrow(() -> new NoSuchElementException("流水线不存在: " + pipelineId));
        if (pipeline.getProject() == null || !projectId.equals(pipeline.getProject().getId())) {
            throw new NoSuchElementException("流水线不属于当前项目: " + pipelineId);
        }
        // 取前 page*size 条做内存分页；Woodpecker 接口本身只支持 limit
        int limit = Math.min(page * size, 200);
        List<ProjectPublicPipelineRunSummary> all = new ArrayList<>();
        String warning = null;
        try {
            for (AiClubPipelineRunSummary run : cicdManagementService.listAiClubPipelineRuns(pipelineId, limit)) {
                all.add(new ProjectPublicPipelineRunSummary(
                        run.number(),
                        run.status(),
                        run.branch(),
                        run.event(),
                        run.startedAt() != null ? run.startedAt() : run.createdAt(),
                        run.url()
                ));
            }
        } catch (RuntimeException ex) {
            log.warn("公开分享拉取 Woodpecker 运行历史失败: pipelineId={}, message={}", pipelineId, ex.getMessage());
            warning = "暂时无法获取流水线运行历史，请稍后重试或联系项目负责人。";
        }
        return buildRunPage(project, projectId, "WOODPECKER", pipelineId, pipeline.getName(), all, page, size, warning);
    }

    /**
     * Jenkins 分支：实时调用 Jenkins API，构建失败时返回空列表 + warning，不影响其它内容。
     */
    private ProjectPublicPipelineRunPage loadJenkinsPipelineRunsForShare(ProjectEntity project,
                                                                         Long projectId,
                                                                         Long pipelineId,
                                                                         int page,
                                                                         int size) {
        ProjectPipelineBindingEntity binding = projectPipelineBindingRepository.findById(pipelineId)
                .orElseThrow(() -> new NoSuchElementException("流水线不存在: " + pipelineId));
        if (binding.getProject() == null || !projectId.equals(binding.getProject().getId())) {
            throw new NoSuchElementException("流水线不属于当前项目: " + pipelineId);
        }
        int limit = Math.min(page * size, 200);
        List<ProjectPublicPipelineRunSummary> all = new ArrayList<>();
        String warning = null;
        try {
            for (JenkinsBuildSummary build : cicdManagementService.listPipelineBuilds(pipelineId, limit)) {
                all.add(new ProjectPublicPipelineRunSummary(
                        build.number(),
                        Boolean.TRUE.equals(build.building()) ? "RUNNING" : trimToNull(build.result()),
                        trimToNull(binding.getDefaultBranch()),
                        "MANUAL",
                        build.executedAt(),
                        build.url()
                ));
            }
        } catch (RuntimeException ex) {
            log.warn("公开分享拉取 Jenkins 构建历史失败: bindingId={}, message={}", pipelineId, ex.getMessage());
            warning = "暂时无法获取流水线运行历史，请稍后重试或联系项目负责人。";
        }
        return buildRunPage(project, projectId, "JENKINS", pipelineId, binding.getJobName(), all, page, size, warning);
    }

    /**
     * 在内存里基于 limit 截断的原始列表做分页，保证返回结构与其它分页接口一致。
     */
    private ProjectPublicPipelineRunPage buildRunPage(ProjectEntity project,
                                                      Long projectId,
                                                      String kind,
                                                      Long pipelineId,
                                                      String pipelineName,
                                                      List<ProjectPublicPipelineRunSummary> all,
                                                      int page,
                                                      int size,
                                                      String warning) {
        int total = all.size();
        int from = Math.min((page - 1) * size, total);
        int to = Math.min(from + size, total);
        List<ProjectPublicPipelineRunSummary> records = all.subList(from, to);
        int totalPages = total == 0 ? 0 : (int) Math.ceil((double) total / size);
        PageResponse<ProjectPublicPipelineRunSummary> pageResponse = new PageResponse<>(records, total, page, size, totalPages);
        return new ProjectPublicPipelineRunPage(projectId, project.getName(), kind, pipelineId, pipelineName, pageResponse, warning);
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
        GitlabAutoMergeConfigEntity entity = requireAutoMergeConfig(id);
        // 同事务里清理外发 webhook 子表，防止留下孤儿记录
        autoMergeWebhookRepository.deleteByConfig_Id(entity.getId());
        autoMergeConfigRepository.delete(entity);
    }

    public GitlabAutoMergeConfigSummary testAutoMergeConfig(Long id) {
        GitlabAutoMergeConfigEntity entity = requireAutoMergeConfig(id);
        ResolvedGitlabConfig resolved = resolveConfig(entity);
        gitlabApiService.fetchCurrentUser(resolved.apiBaseUrl(), resolved.token());
        gitlabApiService.fetchProject(resolved.apiBaseUrl(), resolved.token(), resolved.projectRef());
        return toAutoMergeSummary(entity);
    }

    // ==================== 自动合并外发 Webhook 配置 ====================

    /**
     * 列出指定自动合并配置下的全部 Webhook（已脱敏）。
     */
    public List<GitlabAutoMergeWebhookSummary> listAutoMergeWebhooks(Long configId) {
        GitlabAutoMergeConfigEntity config = requireAutoMergeConfig(configId);
        return autoMergeWebhookRepository.findByConfig_IdOrderByIdAsc(config.getId()).stream()
                .map(this::toAutoMergeWebhookSummary)
                .toList();
    }

    /**
     * 新建一条外发 Webhook，URL 加密落库。
     */
    @Transactional
    public GitlabAutoMergeWebhookSummary createAutoMergeWebhook(Long configId, GitlabAutoMergeWebhookRequest request) {
        GitlabAutoMergeConfigEntity config = requireAutoMergeConfig(configId);
        validateWebhookEvents(request.subscribedEvents());
        autoMergeWebhookRepository.findByConfig_IdAndName(config.getId(), request.name().trim())
                .ifPresent(existing -> { throw new IllegalArgumentException("同一配置下已存在同名 Webhook: " + request.name()); });
        GitlabAutoMergeWebhookEntity entity = new GitlabAutoMergeWebhookEntity();
        entity.setConfig(config);
        applyWebhookRequest(entity, request);
        return toAutoMergeWebhookSummary(autoMergeWebhookRepository.save(entity));
    }

    /**
     * 更新一条外发 Webhook，URL 重新加密。
     */
    @Transactional
    public GitlabAutoMergeWebhookSummary updateAutoMergeWebhook(Long webhookId, GitlabAutoMergeWebhookRequest request) {
        GitlabAutoMergeWebhookEntity entity = requireAutoMergeWebhook(webhookId);
        validateWebhookEvents(request.subscribedEvents());
        autoMergeWebhookRepository.findByConfig_IdAndName(entity.getConfig().getId(), request.name().trim())
                .filter(other -> !other.getId().equals(entity.getId()))
                .ifPresent(other -> { throw new IllegalArgumentException("同一配置下已存在同名 Webhook: " + request.name()); });
        applyWebhookRequest(entity, request);
        return toAutoMergeWebhookSummary(autoMergeWebhookRepository.save(entity));
    }

    /**
     * 删除一条外发 Webhook。
     */
    @Transactional
    public void deleteAutoMergeWebhook(Long webhookId) {
        GitlabAutoMergeWebhookEntity entity = requireAutoMergeWebhook(webhookId);
        autoMergeWebhookRepository.delete(entity);
    }

    /**
     * 用一份固定的演示载荷向指定 Webhook 触发一次同步投递，便于运维联调地址可达性。
     */
    public GitlabAutoMergeWebhookSummary testAutoMergeWebhook(Long webhookId) {
        GitlabAutoMergeWebhookEntity entity = requireAutoMergeWebhook(webhookId);
        autoMergeWebhookDispatcher.dispatchTest(entity);
        // 投递状态由 dispatcher 在新事务里写回，这里重新加载一次拿到最新值
        GitlabAutoMergeWebhookEntity refreshed = autoMergeWebhookRepository.findById(entity.getId()).orElse(entity);
        return toAutoMergeWebhookSummary(refreshed);
    }

    private void applyWebhookRequest(GitlabAutoMergeWebhookEntity entity, GitlabAutoMergeWebhookRequest request) {
        entity.setName(request.name().trim());
        entity.setTargetUrlCiphertext(tokenCipherService.encrypt(request.targetUrl().trim()));
        entity.setSubscribedEventsJson(writeWebhookEventsJson(request.subscribedEvents()));
        String template = request.messageTemplate();
        entity.setMessageTemplate(template == null || template.isBlank() ? null : template);
        entity.setEnabled(request.enabled() == null ? Boolean.TRUE : request.enabled());
    }

    private void validateWebhookEvents(List<String> events) {
        if (events == null || events.isEmpty()) {
            throw new IllegalArgumentException("至少订阅一个事件");
        }
        for (String event : events) {
            if (event == null || event.isBlank() || !GitlabAutoMergeWebhookDispatcher.SUPPORTED_EVENTS.contains(event)) {
                throw new IllegalArgumentException("不支持的订阅事件: " + event);
            }
        }
    }

    private String writeWebhookEventsJson(List<String> events) {
        try {
            // 去重并保留入参顺序，保证审计可读
            LinkedHashSet<String> distinct = new LinkedHashSet<>(events);
            return objectMapper.writeValueAsString(new ArrayList<>(distinct));
        } catch (Exception ex) {
            throw new IllegalStateException("序列化 Webhook 订阅事件失败", ex);
        }
    }

    private GitlabAutoMergeWebhookEntity requireAutoMergeWebhook(Long id) {
        GitlabAutoMergeWebhookEntity entity = autoMergeWebhookRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Webhook 不存在: " + id));
        // 借用配置的可见性校验；若当前用户对配置不可见，则同样不可见 webhook
        requireAutoMergeConfig(entity.getConfig().getId());
        return entity;
    }

    private GitlabAutoMergeWebhookSummary toAutoMergeWebhookSummary(GitlabAutoMergeWebhookEntity entity) {
        List<String> events = readWebhookEventList(entity.getSubscribedEventsJson());
        String urlMasked = maskWebhookUrl(safeDecrypt(entity.getTargetUrlCiphertext()));
        return new GitlabAutoMergeWebhookSummary(
                entity.getId(),
                entity.getConfig() == null ? null : entity.getConfig().getId(),
                entity.getName(),
                urlMasked,
                events,
                entity.getMessageTemplate(),
                entity.getEnabled(),
                entity.getLastDeliveryAt() == null ? null : TIME_FORMATTER.format(entity.getLastDeliveryAt()),
                entity.getLastDeliveryStatus(),
                entity.getLastDeliveryMessage()
        );
    }

    private List<String> readWebhookEventList(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        try {
            List<String> list = objectMapper.readValue(json, new com.fasterxml.jackson.core.type.TypeReference<List<String>>() {});
            return list == null ? List.of() : list;
        } catch (Exception ex) {
            log.warn("解析 Webhook 订阅事件失败: {}", ex.getMessage());
            return List.of();
        }
    }

    private String safeDecrypt(String cipherText) {
        if (cipherText == null || cipherText.isBlank()) {
            return null;
        }
        try {
            return tokenCipherService.decrypt(cipherText);
        } catch (Exception ex) {
            return null;
        }
    }

    /**
     * 仅返回脱敏后的 URL 给前端：保留协议+主机，路径与 query 中段以 *** 占位，便于核对又不暴露 token。
     */
    private String maskWebhookUrl(String url) {
        if (url == null || url.isBlank()) {
            return "";
        }
        try {
            java.net.URI uri = java.net.URI.create(url);
            String scheme = uri.getScheme() == null ? "" : uri.getScheme();
            String host = uri.getHost() == null ? "" : uri.getHost();
            int port = uri.getPort();
            String path = uri.getRawPath() == null ? "" : uri.getRawPath();
            String pathMasked;
            if (path.length() <= 8) {
                pathMasked = path;
            } else {
                pathMasked = path.substring(0, Math.min(6, path.length())) + "***" + path.substring(path.length() - 2);
            }
            String query = uri.getRawQuery();
            String queryMasked = (query == null || query.isBlank()) ? "" : "?***";
            StringBuilder builder = new StringBuilder();
            if (!scheme.isEmpty()) {
                builder.append(scheme).append("://");
            }
            builder.append(host);
            if (port > 0) {
                builder.append(':').append(port);
            }
            builder.append(pathMasked).append(queryMasked);
            return builder.toString();
        } catch (Exception ex) {
            // URL 解析失败就返回前后各几位的简单脱敏，避免把整段 token 透出
            int len = url.length();
            if (len <= 12) {
                return "***";
            }
            return url.substring(0, 8) + "***" + url.substring(len - 4);
        }
    }

    // ==================================================================

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
                    List<String> previousIssues = List.of();
                    CodeReviewResult reviewResult = null;
                    ReviewExecutionContext reviewContext = null;
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
                        previousIssues = loadLatestRejectedReviewIssues(resolved.projectRef(), latestMergeRequest.iid());
                        // Step 1: 检查缓存（命中不扣积分）
                        Optional<ReviewExecutionContext> cached = checkReviewCache(entity, resolved, latestMergeRequest);
                        if (cached.isPresent()) {
                            reviewContext = cached.get();
                        } else {
                            // Step 2: 缓存未命中，需要扣积分执行实际 AI 审核
                            Long chargeUserId = resolveChargeUserId(entity);
                            if (chargeUserId != null) {
                                String businessKey = "auto-merge:" + entity.getId() + ":" + latestMergeRequest.iid() + ":" + System.currentTimeMillis();
                                String creditReason = "AI审核自动合并：" + entity.getName() + " !" + latestMergeRequest.iid();
                                try {
                                    final List<String> finalPrevIssues = previousIssues;
                                    reviewContext = creditConsumptionService.consumeForFeature(
                                            chargeUserId, CREDIT_FEATURE_AUTO_MERGE, businessKey, creditReason,
                                            () -> executeActualReview(entity, resolved, latestMergeRequest, finalPrevIssues)
                                    );
                                } catch (IllegalArgumentException creditEx) {
                                    nonMergedCount++;
                                    String skipReason = "积分余额不足，跳过 AI 审核";
                                    items.add(new GitlabAutoMergeRunItem(latestMergeRequest.iid(), latestMergeRequest.title(),
                                            "CREDIT_INSUFFICIENT", skipReason, latestMergeRequest.webUrl()));
                                    saveAutoMergeLog(entity, triggerType, latestMergeRequest, "CREDIT_INSUFFICIENT",
                                            skipReason, latestMergeRequest.webUrl(), null, executedAt);
                                    continue;
                                }
                            } else {
                                // STANDALONE 模式无关联项目，跳过积分检查直接执行
                                reviewContext = executeActualReview(entity, resolved, latestMergeRequest, previousIssues);
                            }
                        }
                        reviewResult = applyReviewSafetyGuard(reviewContext.reviewResult());
                        if (!reviewResult.approved()) {
                            nonMergedCount++;
                            String reason = buildReviewFailureMessage(reviewResult);
                            String detailMarkdown = buildReviewExtraMarkdown(reviewResult, previousIssues, reviewContext.cacheHit());
                            items.add(new GitlabAutoMergeRunItem(latestMergeRequest.iid(), latestMergeRequest.title(), "AI_REJECTED", reason, latestMergeRequest.webUrl()));
                            saveAutoMergeLog(entity, triggerType, latestMergeRequest, "AI_REJECTED", reason, latestMergeRequest.webUrl(), detailMarkdown, reviewResult,
                                    reviewContext.reviewFingerprint(), reviewContext.reviewFingerprintSource(), reviewContext.cacheHit(), executedAt);
                            continue;
                        }
                    }
                    GitlabApiService.GitlabMergeResult result = gitlabApiService.acceptMergeRequest(resolved.apiBaseUrl(), resolved.token(), resolved.projectRef(), latestMergeRequest.iid(), defaultBoolean(entity.getAutoMerge(), true), defaultBoolean(entity.getSquashOnMerge(), false), defaultBoolean(entity.getRemoveSourceBranch(), true));
                    mergedCount++;
                    String baseMessage = buildMergeMessage(result);
                    String webUrl = hasText(result.webUrl()) ? result.webUrl() : latestMergeRequest.webUrl();
                    String extraMarkdown = reviewResult == null ? null : buildReviewExtraMarkdown(reviewResult, previousIssues, reviewContext != null && reviewContext.cacheHit());
                    String message = baseMessage;
                    if (Boolean.TRUE.equals(entity.getTriggerPipelineAfterMerge())
                            && MODE_PROJECT_BOUND.equals(entity.getExecutionMode())
                            && entity.getBinding() != null
                            && entity.getBinding().getProject() != null) {
                        CicdManagementService.PipelineTriggerOutcome pipelineOutcome = cicdManagementService.triggerSelectedProjectPipelines(
                                entity.getBinding().getProject().getId(),
                                buildPipelineTargetRefs(entity),
                                latestMergeRequest.targetBranch(),
                                "GitLab 自动合并"
                        );
                        message = buildMergedWithPipelineMessage(baseMessage, pipelineOutcome);
                        extraMarkdown = appendMarkdownSection(extraMarkdown, buildPipelineTriggerMarkdown(pipelineOutcome));
                    }
                    items.add(new GitlabAutoMergeRunItem(latestMergeRequest.iid(), latestMergeRequest.title(), "MERGED", message, webUrl));
                    saveAutoMergeLog(entity, triggerType, latestMergeRequest, "MERGED", message, webUrl, extraMarkdown, reviewResult,
                            reviewContext == null ? null : reviewContext.reviewFingerprint(),
                            reviewContext == null ? null : reviewContext.reviewFingerprintSource(),
                            reviewContext != null && reviewContext.cacheHit(),
                            executedAt);
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
        List<GitlabAutoMergePipelineTargetRequest> requestedTargets = request.pipelineTargets() == null ? List.of() : request.pipelineTargets();
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
        entity.setReviewStrictness(normalizeReviewStrictness(request.reviewStrictness()));
        entity.setReviewAgent(request.reviewAgentId() == null ? null : requireAgent(request.reviewAgentId()));
        entity.setAiModelConfig(request.aiModelConfigId() == null ? null : requireChatModelConfig(request.aiModelConfigId()));
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
            if (Boolean.TRUE.equals(entity.getTriggerPipelineAfterMerge())) {
                if (requestedTargets.isEmpty()) {
                    throw new IllegalArgumentException("开启合并后触发流水线时，必须至少选择 1 条目标流水线");
                }
                entity.setPipelineTargets(resolvePipelineTargets(entity, binding.getProject().getId(), requestedTargets));
            } else {
                entity.setPipelineTargets(List.of());
            }
        } else {
            if (Boolean.TRUE.equals(entity.getTriggerPipelineAfterMerge())) {
                throw new IllegalArgumentException("独立运行模式不支持合并后自动触发流水线");
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
            entity.setPipelineTargets(List.of());
        }
    }

    /**
     * 把前端提交的目标流水线选择解析为实体子项，并校验其确实属于当前项目。
     */
    private List<GitlabAutoMergePipelineTargetEntity> resolvePipelineTargets(GitlabAutoMergeConfigEntity config,
                                                                            Long projectId,
                                                                            List<GitlabAutoMergePipelineTargetRequest> requestedTargets) {
        LinkedHashMap<String, GitlabAutoMergePipelineTargetEntity> deduplicatedTargets = new LinkedHashMap<>();
        for (GitlabAutoMergePipelineTargetRequest targetRequest : requestedTargets) {
            if (targetRequest == null || targetRequest.targetId() == null || !hasText(targetRequest.targetType())) {
                throw new IllegalArgumentException("目标流水线配置不完整");
            }
            String targetType = targetRequest.targetType().trim().toUpperCase();
            GitlabAutoMergePipelineTargetEntity target = new GitlabAutoMergePipelineTargetEntity();
            target.setConfig(config);
            target.setTargetType(targetType);
            switch (targetType) {
                case AUTO_MERGE_TARGET_AI_CLUB -> {
                    AiClubPipelineEntity pipeline = aiClubPipelineRepository.findById(targetRequest.targetId())
                            .orElseThrow(() -> new NoSuchElementException("AI Club Pipeline 不存在: " + targetRequest.targetId()));
                    if (pipeline.getProject() == null || !projectId.equals(pipeline.getProject().getId())) {
                        throw new IllegalArgumentException("所选 AI Club Pipeline 不属于当前项目");
                    }
                    target.setAiClubPipeline(pipeline);
                }
                case AUTO_MERGE_TARGET_JENKINS -> {
                    ProjectPipelineBindingEntity binding = projectPipelineBindingRepository.findById(targetRequest.targetId())
                            .orElseThrow(() -> new NoSuchElementException("项目流水线绑定不存在: " + targetRequest.targetId()));
                    if (binding.getProject() == null || !projectId.equals(binding.getProject().getId())) {
                        throw new IllegalArgumentException("所选 Jenkins 流水线不属于当前项目");
                    }
                    target.setJenkinsBinding(binding);
                }
                default -> throw new IllegalArgumentException("不支持的流水线类型: " + targetRequest.targetType());
            }
            deduplicatedTargets.put(targetType + ":" + targetRequest.targetId(), target);
        }
        return new ArrayList<>(deduplicatedTargets.values());
    }

    private List<CicdManagementService.PipelineTargetRef> buildPipelineTargetRefs(GitlabAutoMergeConfigEntity entity) {
        if (entity.getPipelineTargets() == null || entity.getPipelineTargets().isEmpty()) {
            return List.of();
        }
        return entity.getPipelineTargets().stream()
                .map(this::toPipelineTargetRef)
                .filter(target -> target.targetId() != null)
                .toList();
    }

    private CicdManagementService.PipelineTargetRef toPipelineTargetRef(GitlabAutoMergePipelineTargetEntity entity) {
        if (entity == null || !hasText(entity.getTargetType())) {
            return new CicdManagementService.PipelineTargetRef(null, null);
        }
        Long targetId = AUTO_MERGE_TARGET_AI_CLUB.equalsIgnoreCase(entity.getTargetType())
                ? entity.getAiClubPipeline() == null ? null : entity.getAiClubPipeline().getId()
                : entity.getJenkinsBinding() == null ? null : entity.getJenkinsBinding().getId();
        return new CicdManagementService.PipelineTargetRef(entity.getTargetType().trim().toUpperCase(), targetId);
    }

    private List<GitlabAutoMergePipelineTargetSummary> buildPipelineTargetSummaries(GitlabAutoMergeConfigEntity entity) {
        if (entity.getPipelineTargets() == null || entity.getPipelineTargets().isEmpty()) {
            return List.of();
        }
        return entity.getPipelineTargets().stream()
                .map(this::toPipelineTargetSummary)
                .toList();
    }

    private GitlabAutoMergePipelineTargetSummary toPipelineTargetSummary(GitlabAutoMergePipelineTargetEntity entity) {
        if (entity == null || !hasText(entity.getTargetType())) {
            return new GitlabAutoMergePipelineTargetSummary("", null, "", "", null, false);
        }
        if (AUTO_MERGE_TARGET_AI_CLUB.equalsIgnoreCase(entity.getTargetType()) && entity.getAiClubPipeline() != null) {
            AiClubPipelineEntity pipeline = entity.getAiClubPipeline();
            return new GitlabAutoMergePipelineTargetSummary(
                    AUTO_MERGE_TARGET_AI_CLUB,
                    pipeline.getId(),
                    pipeline.getName(),
                    pipeline.getProviderCode(),
                    pipeline.getDefaultBranch(),
                    defaultBoolean(pipeline.getEnabled(), true)
            );
        }
        if (entity.getJenkinsBinding() != null) {
            ProjectPipelineBindingEntity binding = entity.getJenkinsBinding();
            return new GitlabAutoMergePipelineTargetSummary(
                    AUTO_MERGE_TARGET_JENKINS,
                    binding.getId(),
                    binding.getJobName(),
                    binding.getJenkinsServer() == null ? "JENKINS" : binding.getJenkinsServer().getName(),
                    binding.getDefaultBranch(),
                    defaultBoolean(binding.getEnabled(), true)
            );
        }
        return new GitlabAutoMergePipelineTargetSummary(entity.getTargetType(), null, "", "", null, false);
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

    /**
     * 执行一次带历史问题上下文的 MR 复审，让模型同时判断旧问题修复状态和本次新增风险。
     */
    private CodeReviewResult reviewMergeRequest(GitlabAutoMergeConfigEntity entity,
                                                ResolvedGitlabConfig resolved,
                                                GitlabApiService.GitlabMergeRequest mergeRequest,
                                                List<String> previousIssues) {
        GitlabApiService.GitlabMergeRequestChanges changes = gitlabApiService.fetchMergeRequestChanges(
                resolved.apiBaseUrl(), resolved.token(), resolved.projectRef(), mergeRequest.iid());
        String reviewStrictness = normalizeReviewStrictness(entity.getReviewStrictness());
        if (entity.getReviewAgent() != null) {
            return agentExecutionService.reviewMergeRequest(entity.getReviewAgent().getId(), mergeRequest, changes, previousIssues, reviewStrictness);
        }
        if (entity.getAiModelConfig() == null) {
            throw new IllegalArgumentException("AI ????? Code Review Agent");
        }
        ensureChatModelConfig(entity.getAiModelConfig());
        ModelConfigService.ResolvedModelConfig modelConfig = modelConfigService.resolveModelConfig(entity.getAiModelConfig().getId());
        return codeReviewClientService.reviewMergeRequest(modelConfig, buildReviewPrompt(entity), mergeRequest, changes, previousIssues, reviewStrictness);
    }

    /**
     * 仅做指纹匹配和缓存查询，不执行实际 AI 审核。
     * 命中缓存时返回 ReviewExecutionContext(cacheHit=true)；未命中时返回 empty。
     */
    private Optional<ReviewExecutionContext> checkReviewCache(GitlabAutoMergeConfigEntity entity,
                                                             ResolvedGitlabConfig resolved,
                                                             GitlabApiService.GitlabMergeRequest mergeRequest) {
        ReviewFingerprint reviewFingerprint = buildShaReviewFingerprint(entity, resolved.projectRef(), mergeRequest);
        if (reviewFingerprint != null) {
            Optional<CodeReviewResult> cached = loadCachedReviewResult(resolved.projectRef(), mergeRequest.iid(), reviewFingerprint.value());
            if (cached.isPresent()) {
                return Optional.of(new ReviewExecutionContext(cached.get(), reviewFingerprint.value(), reviewFingerprint.source(), true));
            }
        }
        GitlabApiService.GitlabMergeRequestChanges changes = gitlabApiService.fetchMergeRequestChanges(
                resolved.apiBaseUrl(), resolved.token(), resolved.projectRef(), mergeRequest.iid());
        if (reviewFingerprint == null) {
            reviewFingerprint = buildDiffReviewFingerprint(entity, resolved.projectRef(), mergeRequest, changes);
            Optional<CodeReviewResult> cached = loadCachedReviewResult(resolved.projectRef(), mergeRequest.iid(), reviewFingerprint.value());
            if (cached.isPresent()) {
                return Optional.of(new ReviewExecutionContext(cached.get(), reviewFingerprint.value(), reviewFingerprint.source(), true));
            }
        }
        return Optional.empty();
    }

    /**
     * 执行实际 AI 审核（仅在缓存未命中时调用，会消耗积分）。
     * 调用方需先通过 checkReviewCache 确认未命中缓存。
     */
    private ReviewExecutionContext executeActualReview(GitlabAutoMergeConfigEntity entity,
                                                       ResolvedGitlabConfig resolved,
                                                       GitlabApiService.GitlabMergeRequest mergeRequest,
                                                       List<String> previousIssues) {
        ReviewFingerprint reviewFingerprint = buildShaReviewFingerprint(entity, resolved.projectRef(), mergeRequest);
        GitlabApiService.GitlabMergeRequestChanges changes = gitlabApiService.fetchMergeRequestChanges(
                resolved.apiBaseUrl(), resolved.token(), resolved.projectRef(), mergeRequest.iid());
        if (reviewFingerprint == null) {
            reviewFingerprint = buildDiffReviewFingerprint(entity, resolved.projectRef(), mergeRequest, changes);
        }
        String reviewStrictness = normalizeReviewStrictness(entity.getReviewStrictness());
        CodeReviewResult reviewResult;
        if (entity.getReviewAgent() != null) {
            reviewResult = agentExecutionService.reviewMergeRequest(entity.getReviewAgent().getId(), mergeRequest, changes, previousIssues, reviewStrictness);
        } else {
            if (entity.getAiModelConfig() == null) {
                throw new IllegalArgumentException("AI 模型不能为空，或请改为选择 Code Review Agent");
            }
            ensureChatModelConfig(entity.getAiModelConfig());
            ModelConfigService.ResolvedModelConfig modelConfig = modelConfigService.resolveModelConfig(entity.getAiModelConfig().getId());
            reviewResult = codeReviewClientService.reviewMergeRequest(modelConfig, buildReviewPrompt(entity), mergeRequest, changes, previousIssues, reviewStrictness);
        }
        return new ReviewExecutionContext(reviewResult, reviewFingerprint.value(), reviewFingerprint.source(), false);
    }

    /**
     * 解析积分扣费用户：PROJECT_BOUND 模式取项目 owner，STANDALONE 模式返回 null（跳过积分检查）。
     */
    private Long resolveChargeUserId(GitlabAutoMergeConfigEntity entity) {
        if (MODE_PROJECT_BOUND.equals(entity.getExecutionMode())
                && entity.getBinding() != null
                && entity.getBinding().getProject() != null
                && entity.getBinding().getProject().getOwnerUser() != null) {
            return entity.getBinding().getProject().getOwnerUser().getId();
        }
        return null;
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

    /**
     * 将页面或旧数据里的审查严格度统一收口为平台支持的枚举，默认采用中等严格度。
     */
    private String normalizeReviewStrictness(String value) {
        if (!hasText(value)) {
            return REVIEW_STRICTNESS_MEDIUM;
        }
        String normalized = value.trim().toUpperCase();
        return switch (normalized) {
            case REVIEW_STRICTNESS_HIGH, REVIEW_STRICTNESS_MEDIUM, REVIEW_STRICTNESS_LOW -> normalized;
            default -> REVIEW_STRICTNESS_MEDIUM;
        };
    }

    private String buildReviewFailureMessage(CodeReviewResult reviewResult) {
        String summary = hasText(reviewResult.summary()) ? reviewResult.summary() : "AI Review \u672a\u901a\u8fc7";
        List<String> pendingIssues = normalizeIssueList(reviewResult.issues());
        List<String> unresolvedPreviousIssues = normalizeIssueList(reviewResult.unresolvedPreviousIssues());
        if (pendingIssues.isEmpty() && unresolvedPreviousIssues.isEmpty()) {
            return limitMessage(summary);
        }
        if (!unresolvedPreviousIssues.isEmpty()) {
            return limitMessage(summary + "\uff08" + unresolvedPreviousIssues.size() + " \u9879\u5386\u53f2\u95ee\u9898\u672a\u4fee\u590d\uff0c\u5f53\u524d\u5171 " + pendingIssues.size() + " \u9879\u5f85\u5904\u7406\u95ee\u9898\uff09");
        }
        return limitMessage(summary + "\uff08" + pendingIssues.size() + " \u9879\u5f85\u5904\u7406\u95ee\u9898\uff09");
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
        saveAutoMergeLog(config, triggerType, mergeRequest, result, reason, webUrl, extraMarkdown, null, executedAt);
    }

    private void saveAutoMergeLog(GitlabAutoMergeConfigEntity config,
                                  String triggerType,
                                  GitlabApiService.GitlabMergeRequest mergeRequest,
                                  String result,
                                  String reason,
                                  String webUrl,
                                  String extraMarkdown,
                                  CodeReviewResult reviewResult,
                                  LocalDateTime executedAt) {
        saveAutoMergeLog(config, triggerType, mergeRequest, result, reason, webUrl, extraMarkdown, reviewResult, null, null, false, executedAt);
    }

    private void saveAutoMergeLog(GitlabAutoMergeConfigEntity config,
                                  String triggerType,
                                  GitlabApiService.GitlabMergeRequest mergeRequest,
                                  String result,
                                  String reason,
                                  String webUrl,
                                  String extraMarkdown,
                                  CodeReviewResult reviewResult,
                                  String reviewFingerprint,
                                  String reviewFingerprintSource,
                                  boolean reviewCacheHit,
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
                reviewResult,
                reviewFingerprint,
                reviewFingerprintSource,
                reviewCacheHit,
                executedAt
        );
    }

    private void saveAutoMergeLog(GitlabAutoMergeConfigEntity config, String triggerType, Long mergeRequestIid, String mergeRequestTitle, String result, String reason, String webUrl, String extraMarkdown, LocalDateTime executedAt) {
        saveAutoMergeLog(config, triggerType, mergeRequestIid, mergeRequestTitle, null, null, result, reason, webUrl, extraMarkdown, null, null, null, false, executedAt);
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
                                  CodeReviewResult reviewResult,
                                  String reviewFingerprint,
                                  String reviewFingerprintSource,
                                  boolean reviewCacheHit,
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
        log.setGitlabProjectRefSnapshot(resolveLogProjectRefSnapshot(config));
        log.setResult(result);
        log.setReason(limitMessage(reason));
        log.setReviewIssuesJson(writeIssueListJson(reviewResult == null ? null : reviewResult.issues()));
        log.setResolvedPreviousIssuesJson(writeIssueListJson(reviewResult == null ? null : reviewResult.resolvedPreviousIssues()));
        log.setUnresolvedPreviousIssuesJson(writeIssueListJson(reviewResult == null ? null : reviewResult.unresolvedPreviousIssues()));
        log.setReviewFingerprint(trimToNull(reviewFingerprint));
        log.setReviewFingerprintSource(trimToNull(reviewFingerprintSource));
        log.setReviewResultJson(writeReviewResultJson(reviewResult));
        log.setReviewCacheHit(reviewResult == null ? null : reviewCacheHit);
        log.setDetailMarkdown(limitDetailMarkdown(buildLogDetailMarkdown(config, triggerType, mergeRequestIid, mergeRequestTitle, result, reason, webUrl, executedAt, extraMarkdown)));
        log.setWebUrl(trimToNull(webUrl));
        log.setExecutedAt(executedAt == null ? LocalDateTime.now() : executedAt);
        autoMergeLogRepository.save(log);
        notifyMergeRequestAuthor(log);
        // 触发外发 webhook 投递（异步、不重试，异常吞掉避免影响主流程）
        autoMergeWebhookDispatcher.dispatchAsync(log);
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
        if (hasText(extraMarkdown) && extraMarkdown.contains("本次 AI 审查复用历史结果，未重新调用模型")) {
            builder.append("- AI 审查：复用历史结果，未重新调用模型\n");
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

    /**
     * 将历史问题修复状态与原始 AI Review 输出拼成统一 Markdown，确保日志详情固定可读。
     */
    private String buildReviewExtraMarkdown(CodeReviewResult reviewResult, List<String> previousIssues, boolean reviewCacheHit) {
        List<String> normalizedPreviousIssues = normalizeIssueList(previousIssues);
        List<String> resolvedPreviousIssues = normalizeIssueList(reviewResult.resolvedPreviousIssues());
        List<String> unresolvedPreviousIssues = normalizeIssueList(reviewResult.unresolvedPreviousIssues());
        List<String> pendingIssues = normalizeIssueList(reviewResult.issues());
        List<String> newlyRaisedIssues = subtractIssues(pendingIssues, unresolvedPreviousIssues);
        // “本次新增”按定义就是 pendingIssues 的子集，若同一条 issue 同时落到两个区块，
        // 前端会得到相同的 issueId，导致单选 name、v-for key、feedbackState key 全部冲突，
        // 表现为勾选串扰、状态被覆盖。这里把"仍需处理"中已出现在"本次新增"里的条目剔除，
        // 保证整篇 detailMarkdown 内 issueId 全局唯一。
        List<String> pendingOnlyIssues = subtractIssues(pendingIssues, newlyRaisedIssues);
        // 仅为"本次新增问题"和"当前仍需处理问题"两个区块挂稳定 issueId，
        // 让前端分享页能逐条挂反馈；其它三个区块（上次问题/已修复项/未修复项）保持纯文本，避免歧义。
        List<ReviewIssueItem> newlyRaisedItems = toReviewIssueItems(newlyRaisedIssues);
        List<ReviewIssueItem> pendingItems = toReviewIssueItems(pendingOnlyIssues);
        StringBuilder builder = new StringBuilder();
        if (reviewCacheHit) {
            builder.append("> 本次 AI 审查复用历史结果，未重新调用模型。\n\n");
        }
        builder.append("## \u5386\u53f2\u95ee\u9898\u4fee\u590d\u60c5\u51b5\n\n");
        appendMarkdownIssueSection(builder, "### \u4e0a\u6b21\u95ee\u9898", normalizedPreviousIssues);
        appendMarkdownIssueSection(builder, "### \u5df2\u4fee\u590d\u9879", resolvedPreviousIssues);
        appendMarkdownIssueSection(builder, "### \u672a\u4fee\u590d\u9879", unresolvedPreviousIssues);
        appendMarkdownIssueItemSection(builder, "### \u672c\u6b21\u65b0\u589e\u95ee\u9898", newlyRaisedItems);
        appendMarkdownIssueItemSection(builder, "### \u5f53\u524d\u4ecd\u9700\u5904\u7406\u95ee\u9898", pendingItems);
        if (hasText(reviewResult.reviewMarkdown())) {
            builder.append("\n## Code Review \u8f93\u51fa\n\n").append(reviewResult.reviewMarkdown().trim());
            return builder.toString();
        }
        builder.append("\n## Code Review \u8f93\u51fa\n\n");
        builder.append("### \u603b\u7ed3\n");
        builder.append(hasText(reviewResult.summary()) ? reviewResult.summary().trim() : "\u672a\u63d0\u4f9b\u5ba1\u67e5\u6458\u8981").append("\n");
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
     * 同一 MR 的历史问题带入依赖“GitLab 项目 + MR IID”，这里优先读取最近一次 AI 拒绝后的问题快照。
     */
    private List<String> loadLatestRejectedReviewIssues(String gitlabProjectRef, Long mergeRequestIid) {
        String normalizedProjectRef = trimToNull(gitlabProjectRef);
        if (normalizedProjectRef == null || mergeRequestIid == null) {
            return List.of();
        }
        return autoMergeLogRepository
                .findTopByGitlabProjectRefSnapshotAndMergeRequestIidAndResultOrderByExecutedAtDescIdDesc(
                        normalizedProjectRef,
                        mergeRequestIid,
                        "AI_REJECTED"
                )
                .map(log -> readIssueListJson(log.getReviewIssuesJson()))
                .orElseGet(List::of);
    }

    /**
     * 同一 MR + 版本指纹命中缓存时，直接复用上一次结构化审查结果，避免重复调用模型。
     */
    private Optional<CodeReviewResult> loadCachedReviewResult(String gitlabProjectRef, Long mergeRequestIid, String reviewFingerprint) {
        String normalizedProjectRef = trimToNull(gitlabProjectRef);
        String normalizedFingerprint = trimToNull(reviewFingerprint);
        if (normalizedProjectRef == null || mergeRequestIid == null || normalizedFingerprint == null) {
            return Optional.empty();
        }
        return autoMergeLogRepository
                .findTopByGitlabProjectRefSnapshotAndMergeRequestIidAndReviewFingerprintAndReviewResultJsonIsNotNullOrderByExecutedAtDescIdDesc(
                        normalizedProjectRef,
                        mergeRequestIid,
                        normalizedFingerprint
                )
                .flatMap(log -> readReviewResultJson(log.getReviewResultJson()));
    }

    private ReviewFingerprint buildShaReviewFingerprint(GitlabAutoMergeConfigEntity entity,
                                                        String gitlabProjectRef,
                                                        GitlabApiService.GitlabMergeRequest mergeRequest) {
        String normalizedProjectRef = trimToNull(gitlabProjectRef);
        String headSha = trimToNull(mergeRequest.headSha());
        String baseSha = trimToNull(mergeRequest.baseSha());
        if (normalizedProjectRef == null || mergeRequest.iid() == null || headSha == null || baseSha == null) {
            return null;
        }
        String payload = String.join("|",
                normalizedProjectRef,
                String.valueOf(mergeRequest.iid()),
                headSha,
                baseSha,
                defaultString(trimToNull(mergeRequest.startSha())),
                resolveReviewConfigKey(entity),
                hashText(defaultString(trimToNull(entity.getAiReviewPrompt()))));
        return new ReviewFingerprint("sha:" + hashText(payload), REVIEW_FINGERPRINT_SOURCE_SHA);
    }

    private ReviewFingerprint buildDiffReviewFingerprint(GitlabAutoMergeConfigEntity entity,
                                                         String gitlabProjectRef,
                                                         GitlabApiService.GitlabMergeRequest mergeRequest,
                                                         GitlabApiService.GitlabMergeRequestChanges changes) {
        String normalizedProjectRef = trimToNull(gitlabProjectRef);
        if (normalizedProjectRef == null || mergeRequest.iid() == null) {
            return new ReviewFingerprint("diff:" + hashText(resolveReviewConfigKey(entity)), REVIEW_FINGERPRINT_SOURCE_DIFF);
        }
        StringBuilder payload = new StringBuilder();
        payload.append(normalizedProjectRef)
                .append('|').append(mergeRequest.iid())
                .append('|').append(resolveReviewConfigKey(entity))
                .append('|').append(hashText(defaultString(trimToNull(entity.getAiReviewPrompt()))));
        if (changes != null && changes.changes() != null) {
            for (GitlabApiService.GitlabChange change : changes.changes()) {
                payload.append("\n--change--\n")
                        .append(defaultString(change.oldPath())).append('\n')
                        .append(defaultString(change.newPath())).append('\n')
                        .append(defaultString(change.diff())).append('\n')
                        .append(change.newFile()).append('|')
                        .append(change.deletedFile()).append('|')
                        .append(change.renamedFile());
            }
        }
        return new ReviewFingerprint("diff:" + hashText(payload.toString()), REVIEW_FINGERPRINT_SOURCE_DIFF);
    }

    private String resolveReviewConfigKey(GitlabAutoMergeConfigEntity entity) {
        String agentKey = entity.getReviewAgent() == null ? "" : "agent:" + entity.getReviewAgent().getId();
        String modelKey = entity.getAiModelConfig() == null ? "" : "model:" + entity.getAiModelConfig().getId();
        return normalizeReviewStrictness(entity.getReviewStrictness()) + "|" + agentKey + "|" + modelKey;
    }

    /**
     * 后端对模型结果做最终兜底，只要还有历史问题未修复，就算模型误判 approved=true 也必须拦截。
     */
    private CodeReviewResult applyReviewSafetyGuard(CodeReviewResult reviewResult) {
        List<String> issues = normalizeIssueList(reviewResult.issues());
        List<String> resolvedPreviousIssues = normalizeIssueList(reviewResult.resolvedPreviousIssues());
        List<String> unresolvedPreviousIssues = normalizeIssueList(reviewResult.unresolvedPreviousIssues());
        boolean approved = reviewResult.approved();
        String summary = hasText(reviewResult.summary()) ? reviewResult.summary().trim() : "AI Review 未通过";
        if (approved && !unresolvedPreviousIssues.isEmpty()) {
            approved = false;
            summary = limitMessage(summary + "；检测到仍有历史问题未修复，已自动拦截合并");
        }
        return new CodeReviewResult(
                approved,
                summary,
                defaultString(reviewResult.provider()),
                issues,
                defaultString(reviewResult.reviewMarkdown()),
                resolvedPreviousIssues,
                unresolvedPreviousIssues
        );
    }

    private String resolveLogProjectRefSnapshot(GitlabAutoMergeConfigEntity config) {
        if (MODE_PROJECT_BOUND.equals(config.getExecutionMode()) && config.getBinding() != null) {
            return trimToNull(resolveBindingProjectRef(config.getBinding()));
        }
        return trimToNull(config.getGitlabProjectRef());
    }

    private String writeIssueListJson(List<String> issues) {
        try {
            // 持久化前给每条问题分配稳定 issueId：
            //   issueId = "i-" + SHA-256(issueSemanticKey).substring(0,16)
            // 同一条问题（按 issueSemanticKey 归一化）在不同 log 中拿到同一个 id，
            // 这样前端分享页可以按 issueId 挂逐条反馈，后续 LLM 复盘智能体也能按 issueId 聚合。
            List<ReviewIssueItem> items = toReviewIssueItems(issues);
            return objectMapper.writeValueAsString(items);
        } catch (Exception exception) {
            throw new IllegalStateException("自动合并日志问题列表序列化失败", exception);
        }
    }

    /**
     * 将一组字符串问题转换为带稳定 id 的 {@link ReviewIssueItem} 列表。
     *
     * <p>id 的产生规则：</p>
     * <ul>
     *     <li>先按 {@link #issueSemanticKey(String)} 归一化得到语义键，再做 SHA-256 取前 16 位</li>
     *     <li>语义键为空时退化为对 text 做哈希，保证 id 不空</li>
     *     <li>同一 list 内若有 id 冲突（极少见），后续条目自动补 -1 -2 … 后缀避免重复</li>
     * </ul>
     */
    private List<ReviewIssueItem> toReviewIssueItems(List<String> issues) {
        List<String> normalized = normalizeIssueList(issues);
        if (normalized.isEmpty()) {
            return List.of();
        }
        List<ReviewIssueItem> items = new ArrayList<>(normalized.size());
        Set<String> usedIds = new LinkedHashSet<>();
        for (String issue : normalized) {
            String semantic = issueSemanticKey(issue);
            String basis = hasText(semantic) ? semantic : issue.toLowerCase();
            String baseId = "i-" + hashText(basis).substring(0, 16);
            String finalId = baseId;
            int suffix = 1;
            while (!usedIds.add(finalId)) {
                finalId = baseId + "-" + suffix;
                suffix++;
            }
            items.add(new ReviewIssueItem(finalId, issue));
        }
        return items;
    }

    private String writeReviewResultJson(CodeReviewResult reviewResult) {
        if (reviewResult == null) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(reviewResult);
        } catch (Exception exception) {
            throw new IllegalStateException("自动合并日志审查结果序列化失败", exception);
        }
    }

    private Optional<CodeReviewResult> readReviewResultJson(String json) {
        if (!hasText(json)) {
            return Optional.empty();
        }
        try {
            return Optional.of(objectMapper.readValue(json, CodeReviewResult.class));
        } catch (Exception exception) {
            log.warn("自动合并日志审查结果解析失败: {}", exception.getMessage());
            return Optional.empty();
        }
    }

    /**
     * 读取 issue JSON 列，返回 {@link ReviewIssueItem} 列表。
     * 兼容两种格式：
     * <ul>
     *     <li>新格式：{@code [{"id":"i-xxx","text":"问题描述"}]} — 直接取 id + text</li>
     *     <li>旧格式：{@code ["问题描述"]} — 退化为 id 补空 + text</li>
     * </ul>
     */
    private List<ReviewIssueItem> readIssueItemsJson(String json) {
        if (!hasText(json)) {
            return List.of();
        }
        try {
            JsonNode node = objectMapper.readTree(json);
            if (!node.isArray()) {
                return List.of();
            }
            List<ReviewIssueItem> items = new ArrayList<>();
            // 探测第一个元素来判断新旧格式
            for (JsonNode item : node) {
                if (item.isObject()) {
                    // 新格式：{"id":"i-xxx","text":"问题描述"}
                    String id = item.path("id").asText("");
                    String text = item.path("text").asText("");
                    if (hasText(text)) {
                        items.add(new ReviewIssueItem(hasText(id) ? id : "", text.trim()));
                    }
                } else {
                    // 旧格式：纯字符串
                    String text = item.asText("");
                    if (hasText(text)) {
                        items.add(new ReviewIssueItem("", text.trim()));
                    }
                }
            }
            return items;
        } catch (Exception exception) {
            log.warn("自动合并日志问题列表解析失败: {}", exception.getMessage());
            return List.of();
        }
    }

    /**
     * 读取 issue JSON 列，只取问题文本（丢弃 id），供既有 {@link #issueSemanticKey(String)},
     * {@link #subtractIssues(List, List)} 等纯文本逻辑使用。
     */
    private List<String> readIssueListJson(String json) {
        return readIssueItemsJson(json).stream()
                .map(ReviewIssueItem::text)
                .toList();
    }

    private List<String> normalizeIssueList(List<String> issues) {
        if (issues == null || issues.isEmpty()) {
            return List.of();
        }
        Set<String> normalizedIssues = new LinkedHashSet<>();
        for (String issue : issues) {
            if (hasText(issue)) {
                normalizedIssues.add(issue.trim());
            }
        }
        return List.copyOf(normalizedIssues);
    }

    private List<String> subtractIssues(List<String> issues, List<String> excludedIssues) {
        if (issues == null || issues.isEmpty()) {
            return List.of();
        }
        Set<String> excluded = new LinkedHashSet<>();
        for (String excludedIssue : normalizeIssueList(excludedIssues)) {
            excluded.add(issueSemanticKey(excludedIssue));
        }
        List<String> result = new ArrayList<>();
        for (String issue : normalizeIssueList(issues)) {
            if (!excluded.contains(issueSemanticKey(issue))) {
                result.add(issue);
            }
        }
        return result;
    }

    /**
     * “本次新增问题”判定不再按整句精确匹配，而是取问题主语段做归一化，
     * 避免同一问题只是补充了建议、风险说明后就被误判成新增。
     */
    private String issueSemanticKey(String issue) {
        String normalized = trimToNull(issue);
        if (normalized == null) {
            return "";
        }
        String compact = normalized
                .replace('（', '(')
                .replace('）', ')')
                .replace('：', ':')
                .replaceAll("\\s+", " ")
                .trim();
        String[] segments = compact.split("[，,。；;：:]");
        if (segments.length > 0 && hasText(segments[0])) {
            return segments[0].trim().toLowerCase();
        }
        return compact.toLowerCase();
    }

    private String hashText(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] bytes = digest.digest(defaultString(value).getBytes(StandardCharsets.UTF_8));
            StringBuilder builder = new StringBuilder(bytes.length * 2);
            for (byte current : bytes) {
                builder.append(Character.forDigit((current >> 4) & 0xF, 16));
                builder.append(Character.forDigit(current & 0xF, 16));
            }
            return builder.toString();
        } catch (Exception exception) {
            throw new IllegalStateException("自动合并日志指纹计算失败", exception);
        }
    }

    private void appendMarkdownIssueSection(StringBuilder builder, String title, List<String> issues) {
        builder.append(title).append("\n");
        if (issues == null || issues.isEmpty()) {
            builder.append("- \u65e0\n\n");
            return;
        }
        for (String issue : issues) {
            builder.append("- ").append(issue).append("\n");
        }
        builder.append("\n");
    }

    /**
     * 带 issueId 的渲染版本：每条 bullet 末尾追加 {@code <!-- issue-id: xxx -->} HTML 注释，
     * 让前端分享页可以在 markdown 渲染后逐条挂反馈控件（按 id 定位）。
     *
     * <p>注意：渲染时不要把 id 显示给人类用户，所以采用 HTML 注释而非 markdown 内联。
     * markdown 渲染器会把注释原样保留在输出 HTML 中。</p>
     */
    private void appendMarkdownIssueItemSection(StringBuilder builder, String title, List<ReviewIssueItem> items) {
        builder.append(title).append("\n");
        if (items == null || items.isEmpty()) {
            builder.append("- \u65e0\n\n");
            return;
        }
        for (ReviewIssueItem item : items) {
            if (item == null || !hasText(item.text())) {
                continue;
            }
            builder.append("- ").append(item.text());
            if (hasText(item.id())) {
                builder.append(" <!-- issue-id: ").append(item.id()).append(" -->");
            }
            builder.append("\n");
        }
        builder.append("\n");
    }

    private record ReviewExecutionContext(CodeReviewResult reviewResult,
                                          String reviewFingerprint,
                                          String reviewFingerprintSource,
                                          boolean cacheHit) {
    }

    private record ReviewFingerprint(String value, String source) {
    }

    private String appendMarkdownSection(String baseMarkdown, String extraMarkdown) {
        if (!hasText(baseMarkdown)) {
            return hasText(extraMarkdown) ? extraMarkdown.trim() : null;
        }
        if (!hasText(extraMarkdown)) {
            return baseMarkdown.trim();
        }
        return baseMarkdown.trim() + "\n\n" + extraMarkdown.trim();
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
                hasText(branch.webUrl()) ? branch.webUrl() : buildBindingBranchWebUrl(entity, branch.name()),
                trimToNull(branch.latestCommitTitle())
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

    /**
     * 后台线程实际执行仓库代码结构刷新。
     * 这里统一负责把 code-processing 返回结果落回快照表，并保留旧快照内容兜底页面展示。
     */
    private void runCodeStructureRefresh(Long snapshotId,
                                         GitlabCodeStructureClientService.StructureRepository repository) {
        try {
            GitlabCodeStructureClientService.BuildOverviewResponse response = gitlabCodeStructureClientService.buildOverview(
                    new GitlabCodeStructureClientService.BuildOverviewRequest(repository)
            );
            requiresNewTransactionTemplate.executeWithoutResult(status -> {
                GitlabCodeStructureSnapshotEntity snapshot = codeStructureSnapshotRepository.findById(snapshotId)
                        .orElseThrow(() -> new NoSuchElementException("代码结构快照不存在: " + snapshotId));
                snapshot.setCommitSha(trimToNull(response.commitSha()));
                snapshot.setGeneratedAt(LocalDateTime.now());
                snapshot.setDegraded(Boolean.TRUE.equals(response.degraded()));
                snapshot.setSummaryMarkdown(defaultString(response.summaryMarkdown()));
                snapshot.setOverviewJson(defaultString(response.overviewJson()));
                snapshot.setGraphJson(defaultString(response.graphJson()));
                snapshot.setLastErrorMessage(trimToNull(response.lastErrorMessage()));
                snapshot.setRefreshFinishedAt(LocalDateTime.now());
                snapshot.setStatus(Boolean.TRUE.equals(response.degraded()) ? CODE_STRUCTURE_STATUS_DEGRADED : CODE_STRUCTURE_STATUS_READY);
                codeStructureSnapshotRepository.save(snapshot);
            });
        } catch (RuntimeException exception) {
            log.warn("刷新 GitLab 仓库代码结构失败: snapshotId={}, branch={}, message={}", snapshotId, repository.targetBranch(), exception.getMessage());
            requiresNewTransactionTemplate.executeWithoutResult(status -> {
                GitlabCodeStructureSnapshotEntity snapshot = codeStructureSnapshotRepository.findById(snapshotId)
                        .orElseThrow(() -> new NoSuchElementException("代码结构快照不存在: " + snapshotId));
                snapshot.setStatus(CODE_STRUCTURE_STATUS_FAILED);
                snapshot.setDegraded(false);
                snapshot.setLastErrorMessage(limitMessage(exception.getMessage()));
                snapshot.setRefreshFinishedAt(LocalDateTime.now());
                codeStructureSnapshotRepository.save(snapshot);
            });
        }
    }

    /**
     * 代码结构刷新前先校验绑定状态，避免页面发起一个注定失败的后台任务。
     */
    private void requireCodeStructureRefreshable(ProjectGitlabBindingEntity binding) {
        if (!defaultBoolean(binding.getEnabled(), true)) {
            throw new IllegalArgumentException("当前 GitLab 绑定已停用，不能刷新代码结构");
        }
        if (!hasText(binding.getTokenCiphertext())) {
            throw new IllegalArgumentException("当前 GitLab 绑定未配置 Token，不能刷新代码结构");
        }
    }

    /**
     * 代码结构页的默认分支按“显式参数 -> 绑定默认分支 -> 最近快照 -> main”回退。
     */
    private String resolveCodeStructureBranch(ProjectGitlabBindingEntity binding, String requestedBranch) {
        String normalizedBranch = trimToNull(requestedBranch);
        if (normalizedBranch != null) {
            return normalizedBranch;
        }
        if (hasText(binding.getDefaultTargetBranch())) {
            return binding.getDefaultTargetBranch().trim();
        }
        return codeStructureSnapshotRepository.findFirstByBinding_IdOrderByGeneratedAtDescIdDesc(binding.getId())
                .map(GitlabCodeStructureSnapshotEntity::getBranchName)
                .filter(this::hasText)
                .orElse(DEFAULT_CODE_STRUCTURE_BRANCH);
    }

    /**
     * 为 code-processing 组装稳定的仓库上下文。
     * 刷新时如果绑定里还没有 clone 地址，会先即时回源 GitLab 补齐。
     */
    private GitlabCodeStructureClientService.StructureRepository buildCodeStructureRepository(ProjectGitlabBindingEntity binding,
                                                                                               String branch) {
        String token = tokenCipherService.decrypt(binding.getTokenCiphertext());
        ProjectGitlabBindingEntity refreshedBinding = refreshCodeStructureCloneUrlsIfRequired(binding, token);
        String repoUrl = resolveCodeStructureCloneUrl(refreshedBinding);
        if (!hasText(repoUrl)) {
            throw new IllegalStateException("当前 GitLab 绑定缺少可用的 HTTP Clone 地址");
        }
        return new GitlabCodeStructureClientService.StructureRepository(
                String.valueOf(refreshedBinding.getId()),
                defaultString(hasText(refreshedBinding.getGitlabProjectPath()) ? refreshedBinding.getGitlabProjectPath() : refreshedBinding.getGitlabProjectRef()),
                defaultString(refreshedBinding.getGitlabProjectRef()),
                defaultString(refreshedBinding.getGitlabProjectPath()),
                repoUrl,
                branch,
                refreshedBinding.getApiBaseUrl(),
                token
        );
    }

    /**
     * 仓库代码结构刷新和扫描一样依赖 HTTP clone 地址，这里复用同样的回源补齐策略。
     */
    private ProjectGitlabBindingEntity refreshCodeStructureCloneUrlsIfRequired(ProjectGitlabBindingEntity binding, String token) {
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
        return bindingRepository.save(binding);
    }

    /**
     * 结构化能力首版只支持 HTTP/HTTPS clone 地址。
     */
    private String resolveCodeStructureCloneUrl(ProjectGitlabBindingEntity binding) {
        if (hasText(binding.getGitlabHttpCloneUrl())) {
            return binding.getGitlabHttpCloneUrl().trim();
        }
        if (hasText(binding.getGitlabProjectWebUrl())) {
            String webUrl = binding.getGitlabProjectWebUrl().trim();
            return webUrl.endsWith(".git") ? webUrl : webUrl + ".git";
        }
        return null;
    }

    /**
     * 绑定列表上的代码结构状态优先展示默认分支快照，没有默认分支时回退最近一次快照。
     */
    private GitlabCodeStructureSnapshotEntity resolveBindingCodeStructureSnapshot(ProjectGitlabBindingEntity entity) {
        if (hasText(entity.getDefaultTargetBranch())) {
            Optional<GitlabCodeStructureSnapshotEntity> preferred = codeStructureSnapshotRepository.findByBinding_IdAndBranchName(
                    entity.getId(),
                    entity.getDefaultTargetBranch().trim()
            );
            if (preferred.isPresent()) {
                return preferred.get();
            }
        }
        return codeStructureSnapshotRepository.findFirstByBinding_IdOrderByGeneratedAtDescIdDesc(entity.getId()).orElse(null);
    }

    private GitlabCodeStructureRefreshAcceptedResult toCodeStructureRefreshAcceptedResult(GitlabCodeStructureSnapshotEntity snapshot,
                                                                                          boolean accepted) {
        return new GitlabCodeStructureRefreshAcceptedResult(
                snapshot.getBinding().getId(),
                snapshot.getBranchName(),
                defaultString(snapshot.getStatus()),
                accepted,
                formatTime(snapshot.getRefreshStartedAt()),
                formatTime(snapshot.getGeneratedAt()),
                snapshot.getLastErrorMessage()
        );
    }

    /**
     * 统一把快照表里的 JSON 文本组装成前端页面直接可用的结构。
     */
    private GitlabCodeStructureSnapshotSummary toCodeStructureSnapshotSummary(ProjectGitlabBindingEntity binding,
                                                                              GitlabCodeStructureSnapshotEntity snapshot,
                                                                              String resolvedBranch) {
        JsonNode overviewRoot = readJsonText(snapshot == null ? null : snapshot.getOverviewJson());
        JsonNode graphRoot = readJsonText(snapshot == null ? null : snapshot.getGraphJson());
        return new GitlabCodeStructureSnapshotSummary(
                binding.getId(),
                binding.getProject().getId(),
                binding.getProject().getName(),
                hasText(binding.getGitlabProjectName()) ? binding.getGitlabProjectName() : resolveBindingProjectRef(binding),
                resolveBindingProjectRef(binding),
                resolvedBranch,
                snapshot == null ? null : snapshot.getCommitSha(),
                snapshot == null ? CODE_STRUCTURE_STATUS_NOT_BUILT : defaultString(snapshot.getStatus()),
                snapshot != null && snapshot.isDegraded(),
                overviewRoot.path("truncated").asBoolean(false),
                formatTime(snapshot == null ? null : snapshot.getGeneratedAt()),
                formatTime(snapshot == null ? null : snapshot.getRefreshStartedAt()),
                formatTime(snapshot == null ? null : snapshot.getRefreshFinishedAt()),
                snapshot == null ? "" : defaultString(snapshot.getSummaryMarkdown()),
                snapshot == null ? null : snapshot.getLastErrorMessage(),
                readOverviewCards(overviewRoot.path("overviewCards")),
                readCandidateSymbols(overviewRoot.path("candidateSymbols")),
                readProcesses(overviewRoot.path("candidateProcesses")),
                readStringList(overviewRoot.path("harnessHints")),
                readGraphNodes(graphRoot.path("nodes")),
                readGraphEdges(graphRoot.path("edges"))
        );
    }

    /**
     * 把 code-processing 返回的局部查询 JSON 结果转成前端 DTO。
     */
    private GitlabCodeStructureQueryResult toCodeStructureQueryResult(GitlabCodeStructureClientService.QueryStructureResponse response) {
        JsonNode resultRoot = readJsonText(response.resultJson());
        JsonNode graphRoot = readJsonText(response.graphJson());
        return new GitlabCodeStructureQueryResult(
                defaultString(response.branchName()),
                defaultString(response.commitSha()),
                Boolean.TRUE.equals(response.degraded()),
                resultRoot.path("truncated").asBoolean(Boolean.TRUE.equals(response.truncated())),
                trimToNull(response.lastErrorMessage()),
                readCandidateSymbols(resultRoot.path("hitSymbols")),
                readProcesses(resultRoot.path("hitProcesses")),
                readGraphNodes(graphRoot.path("nodes")),
                readGraphEdges(graphRoot.path("edges"))
        );
    }

    private JsonNode readJsonText(String jsonText) {
        if (!hasText(jsonText)) {
            return objectMapper.createObjectNode();
        }
        try {
            return objectMapper.readTree(jsonText);
        } catch (Exception exception) {
            throw new IllegalStateException("代码结构快照 JSON 解析失败", exception);
        }
    }

    private List<GitlabCodeStructureOverviewCardSummary> readOverviewCards(JsonNode node) {
        List<GitlabCodeStructureOverviewCardSummary> result = new ArrayList<>();
        if (!node.isArray()) {
            return result;
        }
        node.forEach(item -> result.add(new GitlabCodeStructureOverviewCardSummary(
                readText(item, "key"),
                readText(item, "label"),
                readText(item, "value")
        )));
        return result;
    }

    private List<GitlabCodeStructureCandidateSymbolSummary> readCandidateSymbols(JsonNode node) {
        List<GitlabCodeStructureCandidateSymbolSummary> result = new ArrayList<>();
        if (!node.isArray()) {
            return result;
        }
        node.forEach(item -> result.add(new GitlabCodeStructureCandidateSymbolSummary(
                readText(item, "uid"),
                readText(item, "name"),
                readText(item, "filePath"),
                readInteger(item, "startLine"),
                readInteger(item, "endLine"),
                readText(item, "symbolKind")
        )));
        return result;
    }

    private List<GitlabCodeStructureProcessSummary> readProcesses(JsonNode node) {
        List<GitlabCodeStructureProcessSummary> result = new ArrayList<>();
        if (!node.isArray()) {
            return result;
        }
        node.forEach(item -> result.add(new GitlabCodeStructureProcessSummary(
                readText(item, "id"),
                readText(item, "name"),
                readInteger(item, "stepIndex"),
                readInteger(item, "stepCount")
        )));
        return result;
    }

    private List<GitlabCodeStructureGraphNodeSummary> readGraphNodes(JsonNode node) {
        List<GitlabCodeStructureGraphNodeSummary> result = new ArrayList<>();
        if (!node.isArray()) {
            return result;
        }
        node.forEach(item -> result.add(new GitlabCodeStructureGraphNodeSummary(
                readText(item, "id"),
                readText(item, "nodeType"),
                readText(item, "label"),
                readText(item, "secondaryLabel"),
                readText(item, "detailText"),
                readText(item, "filePath"),
                readText(item, "symbolUid"),
                readInteger(item, "startLine"),
                readInteger(item, "endLine"),
                hasText(readText(item, "metadataJson")) ? readText(item, "metadataJson") : "{}"
        )));
        return result;
    }

    private List<GitlabCodeStructureGraphEdgeSummary> readGraphEdges(JsonNode node) {
        List<GitlabCodeStructureGraphEdgeSummary> result = new ArrayList<>();
        if (!node.isArray()) {
            return result;
        }
        node.forEach(item -> result.add(new GitlabCodeStructureGraphEdgeSummary(
                readText(item, "id"),
                readText(item, "sourceId"),
                readText(item, "targetId"),
                readText(item, "edgeType"),
                readText(item, "detailText")
        )));
        return result;
    }

    private List<String> readStringList(JsonNode node) {
        List<String> result = new ArrayList<>();
        if (!node.isArray()) {
            return result;
        }
        node.forEach(item -> {
            if (item != null && !item.isNull() && hasText(item.asText(""))) {
                result.add(item.asText(""));
            }
        });
        return result;
    }

    private String readText(JsonNode node, String fieldName) {
        return node == null || node.isMissingNode() ? "" : node.path(fieldName).asText("");
    }

    private Integer readInteger(JsonNode node, String fieldName) {
        if (node == null || node.isMissingNode() || !node.path(fieldName).canConvertToInt()) {
            return null;
        }
        return node.path(fieldName).asInt();
    }

    private ProjectGitlabBindingSummary toBindingSummary(ProjectGitlabBindingEntity entity) {
        GitlabCodeStructureSnapshotEntity codeStructureSnapshot = resolveBindingCodeStructureSnapshot(entity);
        return new ProjectGitlabBindingSummary(
                entity.getId(),
                entity.getProject().getId(),
                entity.getProject().getName(),
                entity.getApiBaseUrl(),
                entity.getGitlabProjectRef(),
                entity.getGitlabProjectId(),
                entity.getGitlabProjectName(),
                entity.getGitlabProjectPath(),
                entity.getGitlabProjectWebUrl(),
                entity.getDefaultTargetBranch(),
                entity.getProductMainBranch(),
                entity.getTestProfileJson(),
                hasText(entity.getTokenCiphertext()),
                defaultBoolean(entity.getEnabled(), true),
                entity.getLastTestStatus(),
                entity.getLastTestMessage(),
                formatTime(entity.getLastTestedAt()),
                codeStructureSnapshot == null ? CODE_STRUCTURE_STATUS_NOT_BUILT : defaultString(codeStructureSnapshot.getStatus()),
                formatTime(codeStructureSnapshot == null ? null : codeStructureSnapshot.getGeneratedAt()),
                codeStructureSnapshot != null && codeStructureSnapshot.isDegraded()
        );
    }

    private GitlabProductBranchSummary toProductBranchSummary(GitlabProductBranchEntity entity,
                                                              Integer behindCount,
                                                              boolean hasDiffWithMainline,
                                                              GitlabApiService.GitlabMergeRequest openMergeRequest) {
        return new GitlabProductBranchSummary(
                entity.getId(),
                entity.getBinding().getId(),
                entity.getLineCode(),
                entity.getLineName(),
                entity.getBranchName(),
                defaultBoolean(entity.getEnabled(), true),
                behindCount == null ? 0 : behindCount,
                hasDiffWithMainline,
                openMergeRequest != null,
                openMergeRequest == null ? null : openMergeRequest.iid(),
                openMergeRequest == null ? null : openMergeRequest.title(),
                openMergeRequest == null ? null : openMergeRequest.webUrl(),
                entity.getLastSyncStatus(),
                entity.getLastSyncMessage(),
                formatTime(entity.getLastSyncAt()),
                entity.getLastSyncMergeRequestWebUrl()
        );
    }

    private GitlabProductBranchSyncLogSummary toProductBranchSyncLogSummary(GitlabProductBranchSyncLogEntity entity) {
        return new GitlabProductBranchSyncLogSummary(
                entity.getId(),
                entity.getProductBranch() == null ? null : entity.getProductBranch().getId(),
                entity.getProductBranchLineCode(),
                entity.getProductBranchLineName(),
                entity.getSourceBranchName(),
                entity.getTargetBranchName(),
                entity.getSourceCommitSha(),
                entity.getTargetCommitSha(),
                entity.getMergeRequestIid(),
                entity.getMergeRequestTitle(),
                entity.getMergeRequestWebUrl(),
                entity.getResult(),
                entity.getReason(),
                entity.getExecutedByUserId(),
                formatTime(entity.getExecutedAt())
        );
    }

    private ProductBranchSyncExecution executeProductBranchSync(ProjectGitlabBindingEntity binding,
                                                                String projectRef,
                                                                String productMainBranch,
                                                                GitlabApiService.GitlabAuthorization authorization,
                                                                GitlabProductBranchEntity branch,
                                                                LocalDateTime executedAt) {
        Integer behindCount = 0;
        String sourceCommitSha = null;
        String targetCommitSha = null;
        try {
            if (!defaultBoolean(branch.getEnabled(), true)) {
                return finalizeProductBranchSync(
                        binding,
                        branch,
                        productMainBranch,
                        PRODUCT_BRANCH_RESULT_FAILED,
                        "当前产品分线已停用，不能发起主线同步",
                        behindCount,
                        sourceCommitSha,
                        targetCommitSha,
                        null,
                        null,
                        null,
                        executedAt
                );
            }
            if (productMainBranch.equalsIgnoreCase(branch.getBranchName())) {
                return finalizeProductBranchSync(
                        binding,
                        branch,
                        productMainBranch,
                        PRODUCT_BRANCH_RESULT_FAILED,
                        "分线分支不能与产品主线分支相同",
                        behindCount,
                        sourceCommitSha,
                        targetCommitSha,
                        null,
                        null,
                        null,
                        executedAt
                );
            }

            GitlabApiService.GitlabBranchDetail sourceBranch = gitlabApiService.fetchBranch(
                    binding.getApiBaseUrl(),
                    authorization,
                    projectRef,
                    productMainBranch
            );
            GitlabApiService.GitlabBranchDetail targetBranch = gitlabApiService.fetchBranch(
                    binding.getApiBaseUrl(),
                    authorization,
                    projectRef,
                    branch.getBranchName()
            );
            sourceCommitSha = trimToNull(sourceBranch.commitSha());
            targetCommitSha = trimToNull(targetBranch.commitSha());

            GitlabApiService.GitlabCompareResult compareResult = gitlabApiService.compareBranches(
                    binding.getApiBaseUrl(),
                    authorization,
                    projectRef,
                    branch.getBranchName(),
                    productMainBranch
            );
            behindCount = compareResult.commitIds().size();
            if (compareResult.sameRef() || compareResult.commitIds().isEmpty()) {
                return finalizeProductBranchSync(
                        binding,
                        branch,
                        productMainBranch,
                        PRODUCT_BRANCH_RESULT_NO_CHANGE,
                        "主线当前没有新增提交需要同步到该分线",
                        behindCount,
                        sourceCommitSha,
                        targetCommitSha,
                        null,
                        null,
                        null,
                        executedAt
                );
            }

            List<GitlabApiService.GitlabMergeRequest> openMergeRequests = gitlabApiService.listMergeRequests(
                    binding.getApiBaseUrl(),
                    authorization,
                    projectRef,
                    "opened",
                    productMainBranch,
                    branch.getBranchName()
            );
            if (!openMergeRequests.isEmpty()) {
                GitlabApiService.GitlabMergeRequest openMergeRequest = openMergeRequests.get(0);
                return finalizeProductBranchSync(
                        binding,
                        branch,
                        productMainBranch,
                        PRODUCT_BRANCH_RESULT_EXISTING_OPEN_MR,
                        "已存在从产品主线到该分线的开放同步 MR",
                        behindCount,
                        sourceCommitSha,
                        targetCommitSha,
                        openMergeRequest.iid(),
                        openMergeRequest.title(),
                        openMergeRequest.webUrl(),
                        executedAt
                );
            }

            GitlabApiService.GitlabCreatedMergeRequest mergeRequest = gitlabApiService.createMergeRequest(
                    binding.getApiBaseUrl(),
                    authorization,
                    projectRef,
                    productMainBranch,
                    branch.getBranchName(),
                    buildProductBranchSyncMrTitle(productMainBranch, branch.getBranchName()),
                    buildProductBranchSyncMrDescription(binding, branch, productMainBranch, executedAt)
            );
            return finalizeProductBranchSync(
                    binding,
                    branch,
                    productMainBranch,
                    PRODUCT_BRANCH_RESULT_CREATED,
                    "已创建主线同步 MR",
                    behindCount,
                    sourceCommitSha,
                    targetCommitSha,
                    mergeRequest.iid(),
                    mergeRequest.title(),
                    mergeRequest.webUrl(),
                    executedAt
            );
        } catch (RuntimeException exception) {
            return finalizeProductBranchSync(
                    binding,
                    branch,
                    productMainBranch,
                    PRODUCT_BRANCH_RESULT_FAILED,
                    limitMessage(exception.getMessage()),
                    behindCount,
                    sourceCommitSha,
                    targetCommitSha,
                    null,
                    null,
                    null,
                    executedAt
            );
        }
    }

    private ProductBranchSyncExecution finalizeProductBranchSync(ProjectGitlabBindingEntity binding,
                                                                 GitlabProductBranchEntity branch,
                                                                 String sourceBranchName,
                                                                 String result,
                                                                 String message,
                                                                 Integer behindCount,
                                                                 String sourceCommitSha,
                                                                 String targetCommitSha,
                                                                 Long mergeRequestIid,
                                                                 String mergeRequestTitle,
                                                                 String mergeRequestWebUrl,
                                                                 LocalDateTime executedAt) {
        requiresNewTransactionTemplate.executeWithoutResult(status -> {
            updateProductBranchSyncState(branch, result, message, mergeRequestIid, mergeRequestWebUrl, executedAt);
            saveProductBranchSyncLog(
                    binding,
                    branch,
                    sourceBranchName,
                    branch.getBranchName(),
                    sourceCommitSha,
                    targetCommitSha,
                    mergeRequestIid,
                    mergeRequestTitle,
                    mergeRequestWebUrl,
                    result,
                    message,
                    executedAt
            );
        });
        return new ProductBranchSyncExecution(
                result,
                new GitlabProductBranchSyncRunItem(
                        branch.getId(),
                        branch.getLineCode(),
                        branch.getLineName(),
                        branch.getBranchName(),
                        result,
                        message,
                        behindCount == null ? 0 : behindCount,
                        mergeRequestIid,
                        mergeRequestWebUrl
                )
        );
    }

    private void updateProductBranchSyncState(GitlabProductBranchEntity branch,
                                              String result,
                                              String message,
                                              Long mergeRequestIid,
                                              String mergeRequestWebUrl,
                                              LocalDateTime executedAt) {
        branch.setLastSyncStatus(result);
        branch.setLastSyncMessage(limitProductBranchSyncStateMessage(message));
        branch.setLastSyncAt(executedAt);
        branch.setLastSyncMergeRequestIid(mergeRequestIid);
        branch.setLastSyncMergeRequestWebUrl(trimToNull(mergeRequestWebUrl));
        productBranchRepository.save(branch);
    }

    private void saveProductBranchSyncLog(ProjectGitlabBindingEntity binding,
                                          GitlabProductBranchEntity branch,
                                          String sourceBranchName,
                                          String targetBranchName,
                                          String sourceCommitSha,
                                          String targetCommitSha,
                                          Long mergeRequestIid,
                                          String mergeRequestTitle,
                                          String mergeRequestWebUrl,
                                          String result,
                                          String reason,
                                          LocalDateTime executedAt) {
        GitlabProductBranchSyncLogEntity log = new GitlabProductBranchSyncLogEntity();
        log.setBinding(binding);
        log.setProductBranch(branch);
        log.setProductBranchLineCode(branch.getLineCode());
        log.setProductBranchLineName(branch.getLineName());
        log.setSourceBranchName(sourceBranchName);
        log.setTargetBranchName(targetBranchName);
        log.setSourceCommitSha(trimToNull(sourceCommitSha));
        log.setTargetCommitSha(trimToNull(targetCommitSha));
        log.setMergeRequestIid(mergeRequestIid);
        log.setMergeRequestTitle(trimToNull(mergeRequestTitle));
        log.setMergeRequestWebUrl(trimToNull(mergeRequestWebUrl));
        log.setResult(result);
        log.setReason(limitMessage(reason));
        log.setExecutedByUserId(resolveCurrentUserId());
        log.setExecutedAt(executedAt);
        productBranchSyncLogRepository.save(log);
    }

    private String buildProductBranchSyncMrTitle(String sourceBranchName, String targetBranchName) {
        return "[主线同步] " + sourceBranchName + " -> " + targetBranchName;
    }

    private String buildProductBranchSyncMrDescription(ProjectGitlabBindingEntity binding,
                                                       GitlabProductBranchEntity branch,
                                                       String sourceBranchName,
                                                       LocalDateTime executedAt) {
        StringBuilder builder = new StringBuilder();
        builder.append("## 主线同步信息\n\n");
        builder.append("- 平台项目：").append(binding.getProject().getName()).append("\n");
        builder.append("- 产品线：").append(branch.getLineName()).append(" (").append(branch.getLineCode()).append(")\n");
        builder.append("- 主线分支：").append(sourceBranchName).append("\n");
        builder.append("- 分线分支：").append(branch.getBranchName()).append("\n");
        builder.append("- 发起时间：").append(formatTime(executedAt)).append("\n\n");
        builder.append("该 Merge Request 由 AI Club GitLab 产品分支管理自动创建，用于把产品主线代码同步到指定分线。");
        return builder.toString();
    }

    /**
     * 测试模板以 JSON 文本存储；这里在保存前做一次结构校验，避免把脏字符串落库后拖垮执行阶段。
     */
    private String normalizeJsonText(String jsonText) {
        String normalized = trimToNull(jsonText);
        if (normalized == null) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(objectMapper.readTree(normalized));
        } catch (Exception exception) {
            throw new IllegalArgumentException("测试模板配置不是合法 JSON", exception);
        }
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
                normalizeReviewStrictness(entity.getReviewStrictness()),
                buildPipelineTargetSummaries(entity),
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

    private GitlabAutoMergeProjectShareSummary toProjectAutoMergeShareSummary(ProjectEntity project, GitlabAutoMergeProjectShareEntity entity) {
        if (entity == null || !Boolean.TRUE.equals(entity.getEnabled()) || !hasText(entity.getTokenCiphertext())) {
            return new GitlabAutoMergeProjectShareSummary(project.getId(), project.getName(), false, null, null);
        }
        String token = tokenCipherService.decrypt(entity.getTokenCiphertext());
        return new GitlabAutoMergeProjectShareSummary(
                project.getId(),
                project.getName(),
                true,
                entity.getExpiresAt() == null ? "永久有效" : formatTime(entity.getExpiresAt()),
                buildProjectAutoMergeShareUrl(project.getId(), token)
        );
    }

    private ProjectEntity requireVisibleProject(Long projectId) {
        return requireProject(projectId);
    }

    private ProjectEntity requireValidProjectShare(Long projectId, String token) {
        ProjectEntity project = projectRepository.findById(projectId).orElseThrow(() -> new NoSuchElementException("项目不存在: " + projectId));
        GitlabAutoMergeProjectShareEntity share = autoMergeProjectShareRepository.findByProject_Id(projectId)
                .orElseThrow(() -> new IllegalArgumentException("当前项目尚未创建分享链接"));
        if (!Boolean.TRUE.equals(share.getEnabled())) {
            throw new IllegalArgumentException("分享链接已失效");
        }
        if (share.getExpiresAt() != null && share.getExpiresAt().isBefore(LocalDateTime.now())) {
            throw new IllegalArgumentException("分享链接已过期");
        }
        String storedToken = tokenCipherService.decrypt(share.getTokenCiphertext());
        if (!defaultString(storedToken).equals(defaultString(token))) {
            throw new IllegalArgumentException("分享链接无效");
        }
        return project;
    }

    private String buildProjectAutoMergeShareUrl(Long projectId, String token) {
        String baseUrl = trimToNull(publicBaseUrl);
        if (baseUrl == null) {
            baseUrl = resolveCurrentRequestBaseUrl();
        }
        if (baseUrl == null) {
            return null;
        }
        return baseUrl + "/gitlab/public/projects/" + projectId + "/auto-merge-logs/" + token;
    }

    private String resolveCurrentRequestBaseUrl() {
        org.springframework.web.context.request.RequestAttributes attributes = org.springframework.web.context.request.RequestContextHolder.getRequestAttributes();
        if (!(attributes instanceof org.springframework.web.context.request.ServletRequestAttributes servletRequestAttributes)) {
            return null;
        }
        jakarta.servlet.http.HttpServletRequest request = servletRequestAttributes.getRequest();
        String origin = trimToNull(request.getHeader("Origin"));
        if (origin != null) {
            return trimTrailingSlash(origin);
        }
        String referer = trimToNull(request.getHeader("Referer"));
        if (referer != null) {
            try {
                java.net.URI uri = java.net.URI.create(referer);
                StringBuilder builder = new StringBuilder();
                builder.append(uri.getScheme()).append("://").append(uri.getHost());
                if (uri.getPort() > 0
                        && !("http".equalsIgnoreCase(uri.getScheme()) && uri.getPort() == 80)
                        && !("https".equalsIgnoreCase(uri.getScheme()) && uri.getPort() == 443)) {
                    builder.append(':').append(uri.getPort());
                }
                return builder.toString();
            } catch (Exception ignored) {
                // ignore invalid referer and continue with request host fallback
            }
        }
        StringBuilder builder = new StringBuilder();
        builder.append(request.getScheme()).append("://").append(request.getServerName());
        if (request.getServerPort() > 0
                && !("http".equalsIgnoreCase(request.getScheme()) && request.getServerPort() == 80)
                && !("https".equalsIgnoreCase(request.getScheme()) && request.getServerPort() == 443)) {
            builder.append(':').append(request.getServerPort());
        }
        return builder.toString();
    }

    private String generateShareToken() {
        StringBuilder builder = new StringBuilder(32);
        for (int index = 0; index < 32; index++) {
            builder.append(TOKEN_ALPHABET[SECURE_RANDOM.nextInt(TOKEN_ALPHABET.length)]);
        }
        return builder.toString();
    }

    private String trimTrailingSlash(String value) {
        String normalized = trimToNull(value);
        if (normalized == null) {
            return null;
        }
        while (normalized.endsWith("/")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        return normalized;
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

    private Specification<GitlabAutoMergeLogEntity> publicAutoMergeLogSpecification(Long projectId, String result) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.equal(root.join("project", JoinType.INNER).get("id"), projectId));
            predicates.add(cb.isNotNull(root.join("config", JoinType.LEFT).get("id")));
            predicates.add(cb.equal(root.join("config", JoinType.LEFT).get("executionMode"), MODE_PROJECT_BOUND));
            if (hasText(result)) {
                predicates.add(cb.equal(root.get("result"), result.trim().toUpperCase()));
            } else {
                // 默认隐藏 EMPTY（未匹配到任何可执行 MR）的扫描记录，避免对外分享时充满“无内容”行；
                // 仅当调用方显式 ?result=EMPTY 才返回这类记录。
                predicates.add(cb.or(
                        cb.isNull(root.get("result")),
                        cb.notEqual(root.get("result"), "EMPTY")
                ));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
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

    private GitlabProductBranchEntity requireProductBranch(ProjectGitlabBindingEntity binding, Long productBranchId) {
        GitlabProductBranchEntity branch = productBranchRepository.findById(productBranchId)
                .orElseThrow(() -> new NoSuchElementException("产品分线不存在: " + productBranchId));
        if (!binding.getId().equals(branch.getBinding().getId())) {
            throw new NoSuchElementException("产品分线不存在: " + productBranchId);
        }
        return branch;
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

    private void validateProductBranchRequest(ProjectGitlabBindingEntity binding,
                                              String lineCode,
                                              String branchName,
                                              Long currentProductBranchId) {
        boolean duplicatedLineCode = currentProductBranchId == null
                ? productBranchRepository.existsByBinding_IdAndLineCodeIgnoreCase(binding.getId(), lineCode)
                : productBranchRepository.existsByBinding_IdAndLineCodeIgnoreCaseAndIdNot(binding.getId(), lineCode, currentProductBranchId);
        if (duplicatedLineCode) {
            throw new IllegalArgumentException("当前绑定下已存在相同的产品线编码");
        }

        boolean duplicatedBranchName = currentProductBranchId == null
                ? productBranchRepository.existsByBinding_IdAndBranchNameIgnoreCase(binding.getId(), branchName)
                : productBranchRepository.existsByBinding_IdAndBranchNameIgnoreCaseAndIdNot(binding.getId(), branchName, currentProductBranchId);
        if (duplicatedBranchName) {
            throw new IllegalArgumentException("当前绑定下已存在相同的产品分线分支");
        }

        String productMainBranch = trimToNull(binding.getProductMainBranch());
        if (productMainBranch != null && productMainBranch.equalsIgnoreCase(branchName)) {
            throw new IllegalArgumentException("分线分支不能与产品主线分支相同");
        }
    }

    private void validateProductMainBranch(ProjectGitlabBindingEntity binding) {
        String productMainBranch = trimToNull(binding.getProductMainBranch());
        if (productMainBranch == null || binding.getId() == null) {
            return;
        }
        if (productBranchRepository.existsByBinding_IdAndBranchNameIgnoreCase(binding.getId(), productMainBranch)) {
            throw new IllegalArgumentException("产品主线分支不能与已有产品分线分支相同");
        }
    }

    private String requireProductMainBranch(ProjectGitlabBindingEntity binding) {
        String productMainBranch = trimToNull(binding.getProductMainBranch());
        if (!hasText(productMainBranch)) {
            throw new IllegalArgumentException("请先在 GitLab 绑定中配置产品主线分支");
        }
        return productMainBranch;
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

    /**
     * GitLab AI Review 当前只支持文本生成模型，这里显式阻止 Embedding 模型被绑定。
     */
    private AiModelConfigEntity requireChatModelConfig(Long id) {
        AiModelConfigEntity modelConfig = aiModelConfigRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("模型配置不存在: " + id));
        ensureChatModelConfig(modelConfig);
        return modelConfig;
    }

    private void ensureChatModelConfig(AiModelConfigEntity modelConfig) {
        if (!ModelConfigService.MODEL_TYPE_CHAT.equalsIgnoreCase(defaultString(modelConfig.getModelType()))) {
            throw new IllegalArgumentException("AI Review 仅支持绑定对话模型配置");
        }
    }

    private String resolveApiBaseUrl(String value) {
        String apiBaseUrl = hasText(value)
                ? value.trim()
                : platformEnvVarResolver.resolveOrDefault(
                PlatformEnvVarRegistry.KEY_GITLAB_DEFAULT_API_URL,
                () -> null,
                defaultApiUrl
        );
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
            case "SUCCESS" -> limitMessage(mergeMessage + "；" + (multipleBindings ? defaultString(pipelineOutcome.message()) : "已触发流水线"));
            case "SKIPPED" -> limitMessage(mergeMessage + "；未触发流水线：" + defaultString(pipelineOutcome.message()));
            case "FAILED" -> limitMessage(mergeMessage + "；流水线触发失败：" + defaultString(pipelineOutcome.message()));
            case "PARTIAL" -> limitMessage(mergeMessage + "；流水线部分触发：" + defaultString(pipelineOutcome.message()));
            default -> limitMessage(mergeMessage);
        };
    }

    private String buildPipelineTriggerMarkdown(CicdManagementService.PipelineTriggerOutcome pipelineOutcome) {
        if (pipelineOutcome == null) {
            return null;
        }
        StringBuilder builder = new StringBuilder();
        builder.append("## 流水线触发结果\n\n");
        builder.append("- 状态：").append(formatPipelineTriggerStatusText(pipelineOutcome.status())).append("\n");
        if (hasText(pipelineOutcome.message())) {
            builder.append("- 摘要：").append(pipelineOutcome.message().trim()).append("\n");
        }
        if (pipelineOutcome.bindingOutcomes() == null || pipelineOutcome.bindingOutcomes().isEmpty()) {
            return builder.toString();
        }
        builder.append("\n");
        // 多条流水线需要逐条输出状态，方便在合并日志中定位具体哪一条失败或被跳过。
        for (int index = 0; index < pipelineOutcome.bindingOutcomes().size(); index++) {
            CicdManagementService.PipelineBindingOutcome bindingOutcome = pipelineOutcome.bindingOutcomes().get(index);
            if (pipelineOutcome.bindingOutcomes().size() > 1) {
                builder.append("### 流水线 ").append(index + 1).append("\n\n");
            }
            builder.append("- 状态：").append(formatPipelineTriggerStatusText(bindingOutcome.status())).append("\n");
            if (hasText(bindingOutcome.jenkinsServerName())) {
                builder.append("- Provider：").append(bindingOutcome.jenkinsServerName().trim()).append("\n");
            }
            if (hasText(bindingOutcome.jobName())) {
                builder.append("- 名称：").append(bindingOutcome.jobName().trim()).append("\n");
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

    private Long resolveCurrentUserId() {
        return AuthContextHolder.get()
                .map(authContext -> authContext.userId())
                .orElse(null);
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

    /**
     * 产品分线表中的最近同步摘要字段长度为 500，需要和日志详情的 1000 字截断规则分开处理。
     */
    private String limitProductBranchSyncStateMessage(String message) {
        String value = limitMessage(message);
        return value.length() > 500 ? value.substring(0, 500) : value;
    }

    private record ResolvedGitlabConfig(String apiBaseUrl, String token, String projectRef, String targetBranch) {
    }

    private record ProductBranchSyncExecution(String result, GitlabProductBranchSyncRunItem item) {
    }
}
