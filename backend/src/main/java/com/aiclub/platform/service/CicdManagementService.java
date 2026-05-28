package com.aiclub.platform.service;

import com.aiclub.platform.common.DataPermissionScopeType;
import com.aiclub.platform.dto.AiClubPipelineCallbackWebhookSummary;
import com.aiclub.platform.dto.AiClubPipelineCronSummary;
import com.aiclub.platform.domain.model.AiClubPipelineEntity;
import com.aiclub.platform.domain.model.JenkinsServerEntity;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.ProjectGitlabBindingEntity;
import com.aiclub.platform.domain.model.ProjectPipelineBindingEntity;
import com.aiclub.platform.dto.AiClubPipelineRunLogDetail;
import com.aiclub.platform.dto.AiClubPipelineRunSummary;
import com.aiclub.platform.dto.AiClubPipelineConfigCompleteResult;
import com.aiclub.platform.dto.AiClubPipelineConfigEditContextResult;
import com.aiclub.platform.dto.AiClubPipelineConfigPreviewResult;
import com.aiclub.platform.dto.AiClubPipelineConfigStatusItem;
import com.aiclub.platform.dto.AiClubPipelineConfigTemplateItem;
import com.aiclub.platform.dto.AiClubPipelineSummary;
import com.aiclub.platform.dto.AiClubPipelineTriggerWebhookSummary;
import com.aiclub.platform.dto.AiClubPipelineTriggerResult;
import com.aiclub.platform.dto.JenkinsBuildTriggerResult;
import com.aiclub.platform.dto.JenkinsBuildLogDetail;
import com.aiclub.platform.dto.JenkinsBuildSummary;
import com.aiclub.platform.dto.JenkinsJobSummary;
import com.aiclub.platform.dto.JenkinsServerSummary;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.PipelineCenterEntrySummary;
import com.aiclub.platform.dto.ProjectPipelineBindingSummary;
import com.aiclub.platform.dto.WoodpeckerHealthSummary;
import com.aiclub.platform.dto.request.AiClubPipelineConfigCompleteRequest;
import com.aiclub.platform.dto.request.AiClubPipelineConfigPreviewRequest;
import com.aiclub.platform.dto.request.AiClubPipelineCallbackWebhookRequest;
import com.aiclub.platform.dto.request.AiClubPipelineCronRequest;
import com.aiclub.platform.dto.request.AiClubPipelineRequest;
import com.aiclub.platform.dto.request.AiClubPipelineTriggerWebhookRequest;
import com.aiclub.platform.dto.request.JenkinsServerRequest;
import com.aiclub.platform.dto.request.ProjectPipelineBindingRequest;
import com.aiclub.platform.repository.AiClubPipelineRepository;
import com.aiclub.platform.repository.JenkinsServerRepository;
import com.aiclub.platform.repository.ProjectGitlabBindingRepository;
import com.aiclub.platform.repository.ProjectPipelineBindingRepository;
import com.aiclub.platform.repository.ProjectRepository;
import com.aiclub.platform.security.AuthContextHolder;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.criteria.JoinType;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Set;

@Service
@Transactional(readOnly = true)
public class CicdManagementService {

    public static final String PIPELINE_CENTER_ENTRY_AI_CLUB = "AI_CLUB";
    public static final String PIPELINE_CENTER_ENTRY_JENKINS = "JENKINS";
    /**
     * 平台保留变量由系统在触发时自动注入，条目级固定变量不能覆盖这些键。
     */
    private static final Set<String> RESERVED_TRIGGER_VARIABLE_KEYS = Set.of(
            WoodpeckerPipelineProvider.VARIABLE_PIPELINE_ID,
            WoodpeckerPipelineProvider.VARIABLE_PROJECT_ID,
            WoodpeckerPipelineProvider.VARIABLE_TRIGGER_SOURCE
    );

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final DateTimeFormatter PIPELINE_CONFIG_BRANCH_FORMATTER = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");

    private final ProjectRepository projectRepository;
    private final ProjectGitlabBindingRepository projectGitlabBindingRepository;
    private final AiClubPipelineRepository aiClubPipelineRepository;
    private final JenkinsServerRepository jenkinsServerRepository;
    private final ProjectPipelineBindingRepository projectPipelineBindingRepository;
    private final TokenCipherService tokenCipherService;
    private final JenkinsApiService jenkinsApiService;
    private final GitlabApiService gitlabApiService;
    private final AiClubPipelineConfigTemplateService pipelineConfigTemplateService;
    private final WoodpeckerPipelineProvider woodpeckerPipelineProvider;
    private final WoodpeckerApiService woodpeckerApiService;
    private final ObjectMapper objectMapper;
    private final NotificationService notificationService;
    private final ProjectDataPermissionService projectDataPermissionService;
    private final AiClubPipelineAutomationService pipelineAutomationService;

    public CicdManagementService(ProjectRepository projectRepository,
                                 ProjectGitlabBindingRepository projectGitlabBindingRepository,
                                 AiClubPipelineRepository aiClubPipelineRepository,
                                 JenkinsServerRepository jenkinsServerRepository,
                                 ProjectPipelineBindingRepository projectPipelineBindingRepository,
                                 TokenCipherService tokenCipherService,
                                 JenkinsApiService jenkinsApiService,
                                 GitlabApiService gitlabApiService,
                                 AiClubPipelineConfigTemplateService pipelineConfigTemplateService,
                                 WoodpeckerPipelineProvider woodpeckerPipelineProvider,
                                  WoodpeckerApiService woodpeckerApiService,
                                  ObjectMapper objectMapper,
                                  NotificationService notificationService,
                                  ProjectDataPermissionService projectDataPermissionService,
                                  AiClubPipelineAutomationService pipelineAutomationService) {
        this.projectRepository = projectRepository;
        this.projectGitlabBindingRepository = projectGitlabBindingRepository;
        this.aiClubPipelineRepository = aiClubPipelineRepository;
        this.jenkinsServerRepository = jenkinsServerRepository;
        this.projectPipelineBindingRepository = projectPipelineBindingRepository;
        this.tokenCipherService = tokenCipherService;
        this.jenkinsApiService = jenkinsApiService;
        this.gitlabApiService = gitlabApiService;
        this.pipelineConfigTemplateService = pipelineConfigTemplateService;
        this.woodpeckerPipelineProvider = woodpeckerPipelineProvider;
        this.woodpeckerApiService = woodpeckerApiService;
        this.objectMapper = objectMapper;
        this.notificationService = notificationService;
        this.projectDataPermissionService = projectDataPermissionService;
        this.pipelineAutomationService = pipelineAutomationService;
    }

    public WoodpeckerHealthSummary getWoodpeckerHealth() {
        return woodpeckerPipelineProvider.health();
    }

    public List<AiClubPipelineConfigTemplateItem> listAiClubPipelineConfigTemplates() {
        return pipelineConfigTemplateService.listTemplates();
    }

    public List<AiClubPipelineConfigTemplateItem> listAiClubPipelineConfigTemplates(Long id) {
        return pipelineConfigTemplateService.listTemplates(buildTemplateRenderContext(requireAiClubPipeline(id)));
    }

    public AiClubPipelineConfigStatusItem getAiClubPipelineConfigStatus(Long id) {
        AiClubPipelineEntity entity = requireAiClubPipeline(id);
        String branch = resolveAiClubPipelineBranch(entity, null);
        String configPath = defaultString(trimToNull(entity.getConfigPath()), ".woodpecker.yml");
        try {
            boolean exists = repositoryFileExists(entity, branch, configPath);
            if (exists) {
                return new AiClubPipelineConfigStatusItem(
                        "PRESENT",
                        branch,
                        configPath,
                        "目标分支 " + branch + " 已配置流水线文件 " + configPath,
                        formatTime(LocalDateTime.now())
                );
            }
            return new AiClubPipelineConfigStatusItem(
                    "MISSING",
                    branch,
                    configPath,
                    "目标分支 " + branch + " 尚未配置流水线文件 " + configPath + "，可使用平台模板创建 MR 补全配置。",
                    formatTime(LocalDateTime.now())
            );
        } catch (RuntimeException exception) {
            return new AiClubPipelineConfigStatusItem(
                    "UNKNOWN",
                    branch,
                    configPath,
                    limitMessage(exception.getMessage()),
                    formatTime(LocalDateTime.now())
            );
        }
    }

    public AiClubPipelineConfigPreviewResult previewAiClubPipelineConfig(Long id, AiClubPipelineConfigPreviewRequest request) {
        AiClubPipelineEntity entity = requireAiClubPipeline(id);
        String branch = resolveAiClubPipelineBranch(entity, null);
        String configPath = defaultString(trimToNull(entity.getConfigPath()), ".woodpecker.yml");
        String content = request.manualEdit()
                ? defaultString(request.content())
                : pipelineConfigTemplateService.renderTemplate(
                request.templateCode(),
                buildTemplateRenderContext(entity),
                request.parameters()
        );
        return new AiClubPipelineConfigPreviewResult(
                request.templateCode().trim().toUpperCase(),
                content,
                branch,
                configPath
        );
    }

    public AiClubPipelineConfigEditContextResult getAiClubPipelineConfigEditContext(Long id) {
        AiClubPipelineEntity entity = requireAiClubPipeline(id);
        String branch = resolveAiClubPipelineBranch(entity, null);
        String configPath = defaultString(trimToNull(entity.getConfigPath()), ".woodpecker.yml");
        boolean exists = repositoryFileExists(entity, branch, configPath);
        if (!exists) {
            return new AiClubPipelineConfigEditContextResult(
                    branch,
                    configPath,
                    "MISSING",
                    "",
                    AiClubPipelineConfigTemplateService.PREFILL_MODE_FORM,
                    null,
                    Map.of(),
                    "目标分支 " + branch + " 尚未配置流水线文件 " + configPath + "，可使用平台模板创建 MR 补全配置。"
            );
        }
        String rawContent = loadRepositoryFileContent(entity, branch, configPath);
        AiClubPipelineConfigTemplateService.TemplatePrefillResult prefill = pipelineConfigTemplateService.parseExistingConfig(
                rawContent,
                buildTemplateRenderContext(entity)
        );
        return new AiClubPipelineConfigEditContextResult(
                branch,
                configPath,
                "PRESENT",
                rawContent,
                defaultString(prefill.prefillMode(), AiClubPipelineConfigTemplateService.PREFILL_MODE_MANUAL),
                trimToNull(prefill.templateCode()),
                prefill.parameters() == null ? Map.of() : Map.copyOf(prefill.parameters()),
                trimToNull(prefill.message())
        );
    }

    @Transactional(noRollbackFor = RuntimeException.class)
    public AiClubPipelineConfigCompleteResult completeAiClubPipelineConfig(Long id, AiClubPipelineConfigCompleteRequest request) {
        AiClubPipelineEntity entity = requireAiClubPipeline(id);
        pipelineConfigTemplateService.requireTemplateItem(request.templateCode(), buildTemplateRenderContext(entity));
        String branch = resolveAiClubPipelineBranch(entity, null);
        String configPath = defaultString(trimToNull(entity.getConfigPath()), ".woodpecker.yml");
        boolean configExists = repositoryFileExists(entity, branch, configPath);
        String renderedContent = resolvePipelineConfigContent(entity, request);
        prepareTemplateSecrets(entity, request, !configExists);

        ProjectGitlabBindingEntity binding = entity.getGitlabBinding();
        String token = tokenCipherService.decrypt(binding.getTokenCiphertext());
        String projectRef = resolveAiClubPipelineProjectRef(binding);
        String generatedBranch = "ai-club/pipeline-config/" + entity.getId() + "-" + LocalDateTime.now().format(PIPELINE_CONFIG_BRANCH_FORMATTER);
        gitlabApiService.createBranch(binding.getApiBaseUrl(), token, projectRef, generatedBranch, branch);
        GitlabApiService.GitlabCreatedCommit commit = gitlabApiService.createCommit(
                binding.getApiBaseUrl(),
                token,
                projectRef,
                generatedBranch,
                configExists ? "ci: update AI Club Pipeline config" : "ci: add AI Club Pipeline config",
                List.of(new GitlabApiService.GitlabCommitAction(configExists ? "update" : "create", configPath, normalizeConfigContent(renderedContent)))
        );
        GitlabApiService.GitlabCreatedMergeRequest mergeRequest = gitlabApiService.createMergeRequest(
                binding.getApiBaseUrl(),
                token,
                projectRef,
                generatedBranch,
                branch,
                (configExists ? "ci: update AI Club Pipeline config for " : "ci: add AI Club Pipeline config for ") + entity.getName(),
                buildPipelineConfigMergeRequestDescription(entity, branch, configPath, request.templateCode(), configExists)
        );
        return new AiClubPipelineConfigCompleteResult(
                generatedBranch,
                trimToNull(commit.id()),
                trimToNull(commit.webUrl()),
                mergeRequest.iid(),
                trimToNull(mergeRequest.webUrl()),
                configExists ? "已创建流水线配置更新 MR，合并后将应用最新配置" : "已创建流水线配置 MR，合并后即可触发 AI Club Pipeline"
        );
    }

    public PageResponse<AiClubPipelineSummary> pageAiClubPipelines(int page, int size, String keyword, Long projectId, Boolean enabled) {
        ProjectDataPermissionService.ProjectDataScope scope = projectDataPermissionService.requireCurrentScope();
        Pageable pageable = buildPageable(page, size, Sort.by(Sort.Direction.ASC, "id"));
        Page<AiClubPipelineSummary> pageData = aiClubPipelineRepository
                .findAll(aiClubPipelineSpecification(keyword, projectId, enabled, scope), pageable)
                .map(this::toAiClubPipelineSummary);
        return PageResponse.from(pageData);
    }

    public PageResponse<PipelineCenterEntrySummary> pagePipelineCenterEntries(int page,
                                                                              int size,
                                                                              String keyword,
                                                                              Long projectId,
                                                                              Boolean enabled,
                                                                              String entryType) {
        ProjectDataPermissionService.ProjectDataScope scope = projectDataPermissionService.requireCurrentScope();
        List<PipelineCenterEntryEnvelope> allEntries = new ArrayList<>();
        String normalizedEntryType = normalizePipelineCenterEntryType(entryType);

        if (normalizedEntryType == null || PIPELINE_CENTER_ENTRY_AI_CLUB.equals(normalizedEntryType)) {
            aiClubPipelineRepository.findAll(aiClubPipelineSpecification(keyword, projectId, enabled, scope)).stream()
                    .map(this::toPipelineCenterAiClubEntry)
                    .forEach(allEntries::add);
        }
        if (normalizedEntryType == null || PIPELINE_CENTER_ENTRY_JENKINS.equals(normalizedEntryType)) {
            projectPipelineBindingRepository.findAll(pipelineBindingSpecification(keyword, null, enabled, scope)).stream()
                    .filter(binding -> projectId == null || binding.getProject().getId().equals(projectId))
                    .map(this::toPipelineCenterJenkinsEntry)
                    .forEach(allEntries::add);
        }

        allEntries.sort(Comparator
                .comparing(PipelineCenterEntryEnvelope::lastTriggeredAt, Comparator.nullsLast(Comparator.reverseOrder()))
                .thenComparing(PipelineCenterEntryEnvelope::entryType)
                .thenComparing(PipelineCenterEntryEnvelope::entryId, Comparator.reverseOrder())
        );

        int safePage = Math.max(page, 1);
        int safeSize = Math.max(1, Math.min(size, 100));
        int fromIndex = Math.min((safePage - 1) * safeSize, allEntries.size());
        int toIndex = Math.min(fromIndex + safeSize, allEntries.size());
        List<PipelineCenterEntrySummary> records = allEntries.subList(fromIndex, toIndex).stream()
                .map(PipelineCenterEntryEnvelope::summary)
                .toList();
        int totalPages = allEntries.isEmpty() ? 0 : (int) Math.ceil(allEntries.size() / (double) safeSize);
        return new PageResponse<>(records, allEntries.size(), safePage, safeSize, totalPages);
    }

    public AiClubPipelineSummary getAiClubPipeline(Long id) {
        return toAiClubPipelineSummary(requireAiClubPipeline(id));
    }

    public ProjectPipelineBindingSummary getPipelineBinding(Long id) {
        return toPipelineBindingSummary(requirePipelineBinding(id));
    }

    @Transactional
    public AiClubPipelineSummary createAiClubPipeline(AiClubPipelineRequest request) {
        AiClubPipelineEntity entity = new AiClubPipelineEntity();
        fillAiClubPipelineEntity(entity, request, true);
        syncWoodpeckerRepository(entity);
        return toAiClubPipelineSummary(aiClubPipelineRepository.save(entity));
    }

    @Transactional
    public AiClubPipelineSummary updateAiClubPipeline(Long id, AiClubPipelineRequest request) {
        AiClubPipelineEntity entity = requireAiClubPipeline(id);
        fillAiClubPipelineEntity(entity, request, false);
        syncWoodpeckerRepository(entity);
        return toAiClubPipelineSummary(aiClubPipelineRepository.save(entity));
    }

    @Transactional
    public void deleteAiClubPipeline(Long id) {
        aiClubPipelineRepository.delete(requireAiClubPipeline(id));
    }

    @Transactional(noRollbackFor = RuntimeException.class)
    public AiClubPipelineSummary syncAiClubPipelineRepository(Long id) {
        AiClubPipelineEntity entity = requireAiClubPipeline(id);
        syncWoodpeckerRepository(entity);
        return toAiClubPipelineSummary(aiClubPipelineRepository.save(entity));
    }

    @Transactional(noRollbackFor = RuntimeException.class)
    public AiClubPipelineTriggerResult triggerAiClubPipeline(Long id) {
        return triggerAiClubPipeline(requireAiClubPipeline(id), null, "手动触发");
    }

    /**
     * 公开 webhook 入口只允许固定配置触发，不允许外部覆盖分支或注入变量。
     */
    @Transactional(noRollbackFor = RuntimeException.class)
    public AiClubPipelineTriggerResult triggerAiClubPipelineByWebhook(Long id, String token) {
        AiClubPipelineEntity entity = pipelineAutomationService.validateTriggerWebhookAccess(id, token);
        return triggerAiClubPipeline(entity, null, "Webhook 触发");
    }

    public List<AiClubPipelineCronSummary> listAiClubPipelineCronJobs(Long id) {
        return pipelineAutomationService.listCronJobs(id);
    }

    @Transactional
    public AiClubPipelineCronSummary createAiClubPipelineCronJob(Long id, AiClubPipelineCronRequest request) {
        return pipelineAutomationService.createCronJob(id, request);
    }

    @Transactional
    public AiClubPipelineCronSummary updateAiClubPipelineCronJob(Long id, Long cronJobId, AiClubPipelineCronRequest request) {
        return pipelineAutomationService.updateCronJob(id, cronJobId, request);
    }

    @Transactional
    public void deleteAiClubPipelineCronJob(Long id, Long cronJobId) {
        pipelineAutomationService.deleteCronJob(id, cronJobId);
    }

    public AiClubPipelineTriggerWebhookSummary getAiClubPipelineTriggerWebhook(Long id) {
        return pipelineAutomationService.getTriggerWebhook(id);
    }

    @Transactional
    public AiClubPipelineTriggerWebhookSummary updateAiClubPipelineTriggerWebhook(Long id, AiClubPipelineTriggerWebhookRequest request) {
        return pipelineAutomationService.updateTriggerWebhook(id, request);
    }

    public AiClubPipelineCallbackWebhookSummary getAiClubPipelineCallbackWebhook(Long id) {
        return pipelineAutomationService.getCallbackWebhook(id);
    }

    @Transactional
    public AiClubPipelineCallbackWebhookSummary updateAiClubPipelineCallbackWebhook(Long id, AiClubPipelineCallbackWebhookRequest request) {
        return pipelineAutomationService.updateCallbackWebhook(id, request);
    }

    public List<AiClubPipelineRunSummary> listAiClubPipelineRuns(Long id, int limit) {
        AiClubPipelineEntity entity = requireAiClubPipeline(id);
        if (entity.getWoodpeckerRepoId() == null) {
            throw new IllegalArgumentException("流水线尚未同步 Woodpecker 仓库");
        }
        return woodpeckerApiService.listPipelines(entity.getWoodpeckerRepoId(), limit).stream()
                .map(this::toAiClubPipelineRunSummary)
                .toList();
    }

    public AiClubPipelineRunLogDetail getAiClubPipelineRunLog(Long id, int runNumber) {
        AiClubPipelineEntity entity = requireAiClubPipeline(id);
        if (entity.getWoodpeckerRepoId() == null) {
            throw new IllegalArgumentException("流水线尚未同步 Woodpecker 仓库");
        }
        WoodpeckerApiService.WoodpeckerPipeline run = woodpeckerApiService.fetchPipeline(entity.getWoodpeckerRepoId(), runNumber);
        String consoleLog = woodpeckerApiService.fetchAggregatedLogs(entity.getWoodpeckerRepoId(), runNumber);
        return new AiClubPipelineRunLogDetail(
                entity.getProject().getName(),
                entity.getName(),
                entity.getWoodpeckerRepoFullName(),
                run.number(),
                trimToNull(run.status()),
                trimToNull(run.branch()),
                trimToNull(woodpeckerPipelineProvider.resolveRunUrl(entity, run)),
                formatTime(run.startedAt()),
                formatTime(run.finishedAt()),
                consoleLog == null ? "" : consoleLog
        );
    }

    public PageResponse<JenkinsServerSummary> pageJenkinsServers(int page, int size, String keyword, Boolean enabled) {
        Pageable pageable = buildPageable(page, size, Sort.by(Sort.Direction.ASC, "id"));
        Page<JenkinsServerSummary> pageData = jenkinsServerRepository.findAll(jenkinsServerSpecification(keyword, enabled), pageable)
                .map(this::toJenkinsServerSummary);
        return PageResponse.from(pageData);
    }

    public List<JenkinsServerSummary> listJenkinsServerOptions() {
        return jenkinsServerRepository.findAllByEnabledTrueOrderByIdAsc().stream()
                .map(this::toJenkinsServerSummary)
                .toList();
    }

    @Transactional
    public JenkinsServerSummary createJenkinsServer(JenkinsServerRequest request) {
        JenkinsServerEntity entity = new JenkinsServerEntity();
        fillJenkinsServerEntity(entity, request, true);
        return toJenkinsServerSummary(jenkinsServerRepository.save(entity));
    }

    @Transactional
    public JenkinsServerSummary updateJenkinsServer(Long id, JenkinsServerRequest request) {
        JenkinsServerEntity entity = requireJenkinsServer(id);
        fillJenkinsServerEntity(entity, request, false);
        return toJenkinsServerSummary(jenkinsServerRepository.save(entity));
    }

    @Transactional
    public void deleteJenkinsServer(Long id) {
        JenkinsServerEntity entity = requireJenkinsServer(id);
        long bindingCount = projectPipelineBindingRepository.count((root, query, cb) -> cb.equal(root.get("jenkinsServer").get("id"), id));
        if (bindingCount > 0) {
            throw new IllegalArgumentException("当前 Jenkins 服务已被项目流水线绑定，请先删除绑定后再删除");
        }
        jenkinsServerRepository.delete(entity);
    }

    @Transactional(noRollbackFor = RuntimeException.class)
    public JenkinsServerSummary testJenkinsServer(Long id) {
        JenkinsServerEntity entity = requireJenkinsServer(id);
        try {
            String apiToken = tokenCipherService.decrypt(entity.getTokenCiphertext());
            JenkinsApiService.JenkinsServerInfo info = jenkinsApiService.fetchServerInfo(entity.getBaseUrl(), entity.getUsername(), apiToken);
            entity.setLastJobCount(info.jobCount());
            entity.setLastTestStatus("SUCCESS");
            entity.setLastTestMessage(buildServerTestMessage(info));
            entity.setLastTestedAt(LocalDateTime.now());
            return toJenkinsServerSummary(jenkinsServerRepository.save(entity));
        } catch (RuntimeException exception) {
            entity.setLastTestStatus("FAILED");
            entity.setLastTestMessage(limitMessage(exception.getMessage()));
            entity.setLastTestedAt(LocalDateTime.now());
            jenkinsServerRepository.save(entity);
            throw exception;
        }
    }

    public List<JenkinsJobSummary> listJenkinsJobs(Long serverId) {
        JenkinsServerEntity entity = requireJenkinsServer(serverId);
        String apiToken = tokenCipherService.decrypt(entity.getTokenCiphertext());
        return jenkinsApiService.listJobs(entity.getBaseUrl(), entity.getUsername(), apiToken).stream()
                .map(this::toJenkinsJobSummary)
                .toList();
    }

    @Transactional(noRollbackFor = RuntimeException.class)
    public JenkinsBuildTriggerResult triggerJenkinsJob(Long serverId, String jobName) {
        JenkinsServerEntity entity = requireJenkinsServer(serverId);
        if (!Boolean.TRUE.equals(entity.getEnabled())) {
            throw new IllegalArgumentException("关联的 Jenkins 服务未启用");
        }
        String normalizedJobName = trimToNull(jobName);
        if (normalizedJobName == null) {
            throw new IllegalArgumentException("Job 名称不能为空");
        }
        String apiToken = tokenCipherService.decrypt(entity.getTokenCiphertext());
        JenkinsApiService.JenkinsTriggerResult result = jenkinsApiService.triggerJob(
                entity.getBaseUrl(),
                entity.getUsername(),
                apiToken,
                normalizedJobName,
                Map.of()
        );
        LocalDateTime now = LocalDateTime.now();
        return new JenkinsBuildTriggerResult(
                null,
                null,
                entity.getName(),
                normalizedJobName,
                trimToNull(result.triggerUrl()),
                result.message(),
                formatTime(now)
        );
    }

    public List<JenkinsBuildSummary> listPipelineBuilds(Long bindingId, int limit) {
        ProjectPipelineBindingEntity entity = requirePipelineBinding(bindingId);
        String apiToken = tokenCipherService.decrypt(entity.getJenkinsServer().getTokenCiphertext());
        return jenkinsApiService.listBuilds(
                        entity.getJenkinsServer().getBaseUrl(),
                        entity.getJenkinsServer().getUsername(),
                        apiToken,
                        entity.getJobName(),
                        limit
                ).stream()
                .map(this::toBuildSummary)
                .toList();
    }

    public JenkinsBuildLogDetail getPipelineBuildLog(Long bindingId, int buildNumber) {
        ProjectPipelineBindingEntity entity = requirePipelineBinding(bindingId);
        String apiToken = tokenCipherService.decrypt(entity.getJenkinsServer().getTokenCiphertext());
        JenkinsApiService.JenkinsBuildInfo buildInfo = jenkinsApiService.fetchBuild(
                entity.getJenkinsServer().getBaseUrl(),
                entity.getJenkinsServer().getUsername(),
                apiToken,
                entity.getJobName(),
                buildNumber
        );
        String consoleLog = jenkinsApiService.fetchBuildConsoleLog(
                entity.getJenkinsServer().getBaseUrl(),
                entity.getJenkinsServer().getUsername(),
                apiToken,
                entity.getJobName(),
                buildNumber
        );
        return new JenkinsBuildLogDetail(
                entity.getProject().getName(),
                entity.getJenkinsServer().getName(),
                entity.getJobName(),
                buildInfo.number(),
                trimToNull(buildInfo.result()),
                buildInfo.building(),
                formatTime(toLocalDateTime(buildInfo.timestamp())),
                buildInfo.duration(),
                formatDuration(buildInfo.duration()),
                trimToNull(buildInfo.url()),
                trimToNull(buildInfo.description()),
                consoleLog == null ? "" : consoleLog
        );
    }

    public PageResponse<ProjectPipelineBindingSummary> pagePipelineBindings(int page, int size, String keyword, Long serverId, Boolean enabled) {
        ProjectDataPermissionService.ProjectDataScope scope = projectDataPermissionService.requireCurrentScope();
        Pageable pageable = buildPageable(page, size, Sort.by(Sort.Direction.ASC, "id"));
        Page<ProjectPipelineBindingSummary> pageData = projectPipelineBindingRepository
                .findAll(pipelineBindingSpecification(keyword, serverId, enabled, scope), pageable)
                .map(this::toPipelineBindingSummary);
        return PageResponse.from(pageData);
    }

    @Transactional
    public ProjectPipelineBindingSummary createPipelineBinding(ProjectPipelineBindingRequest request) {
        ProjectPipelineBindingEntity entity = new ProjectPipelineBindingEntity();
        fillPipelineBindingEntity(entity, request, true);
        return toPipelineBindingSummary(projectPipelineBindingRepository.save(entity));
    }

    @Transactional
    public ProjectPipelineBindingSummary updatePipelineBinding(Long id, ProjectPipelineBindingRequest request) {
        ProjectPipelineBindingEntity entity = requirePipelineBinding(id);
        fillPipelineBindingEntity(entity, request, false);
        return toPipelineBindingSummary(projectPipelineBindingRepository.save(entity));
    }

    @Transactional
    public void deletePipelineBinding(Long id) {
        projectPipelineBindingRepository.delete(requirePipelineBinding(id));
    }

    @Transactional(noRollbackFor = RuntimeException.class)
    public JenkinsBuildTriggerResult triggerPipelineBuild(Long id) {
        return triggerPipelineBuild(requirePipelineBinding(id), null, "手动触发");
    }

    @Transactional(noRollbackFor = RuntimeException.class)
    public PipelineTriggerOutcome tryTriggerProjectPipeline(Long projectId, String branchOverride, String sourceDescription) {
        List<PipelineBindingOutcome> bindingOutcomes = new ArrayList<>();
        List<AiClubPipelineEntity> aiClubPipelines = aiClubPipelineRepository.findByProject_IdOrderByIdAsc(projectId);
        // AI Club Pipeline 是默认内置 provider，项目级触发时优先走 Woodpecker。
        for (AiClubPipelineEntity entity : aiClubPipelines) {
            if (!Boolean.TRUE.equals(entity.getEnabled())) {
                bindingOutcomes.add(PipelineBindingOutcome.skipped(
                        "AI Club Pipeline 未启用",
                        entity.getName(),
                        entity.getProviderCode()
                ));
                continue;
            }
            try {
                AiClubPipelineTriggerResult result = triggerAiClubPipeline(entity, branchOverride, sourceDescription);
                bindingOutcomes.add(PipelineBindingOutcome.success(
                        result.message(),
                        result.triggerUrl(),
                        result.pipelineName(),
                        result.providerCode()
                ));
            } catch (RuntimeException exception) {
                bindingOutcomes.add(PipelineBindingOutcome.failed(
                        limitMessage(exception.getMessage()),
                        entity.getName(),
                        entity.getProviderCode()
                ));
            }
        }

        List<ProjectPipelineBindingEntity> bindings = projectPipelineBindingRepository.findByProject_IdOrderByIdAsc(projectId);
        // Jenkins 绑定保留为外部兼容链路，继续逐条触发并参与聚合。
        for (ProjectPipelineBindingEntity entity : bindings) {
            if (!Boolean.TRUE.equals(entity.getEnabled())) {
                bindingOutcomes.add(PipelineBindingOutcome.skipped(
                        "外部 Jenkins 绑定未启用",
                        entity.getJobName(),
                        entity.getJenkinsServer().getName()
                ));
                continue;
            }
            if (!Boolean.TRUE.equals(entity.getJenkinsServer().getEnabled())) {
                bindingOutcomes.add(PipelineBindingOutcome.skipped(
                        "关联的 Jenkins 服务未启用",
                        entity.getJobName(),
                        entity.getJenkinsServer().getName()
                ));
                continue;
            }
            try {
                JenkinsBuildTriggerResult result = triggerPipelineBuild(entity, branchOverride, sourceDescription);
                bindingOutcomes.add(PipelineBindingOutcome.success(
                        result.message(),
                        result.triggerUrl(),
                        result.jobName(),
                        result.jenkinsServerName()
                ));
            } catch (RuntimeException exception) {
                bindingOutcomes.add(PipelineBindingOutcome.failed(
                        limitMessage(exception.getMessage()),
                        entity.getJobName(),
                        entity.getJenkinsServer().getName()
                ));
            }
        }
        return buildProjectPipelineOutcome(bindingOutcomes);
    }

    private void fillAiClubPipelineEntity(AiClubPipelineEntity entity, AiClubPipelineRequest request, boolean createMode) {
        ProjectEntity project = requireProject(request.projectId());
        ProjectGitlabBindingEntity gitlabBinding = requireGitlabBinding(request.gitlabBindingId());
        if (!gitlabBinding.getProject().getId().equals(project.getId())) {
            throw new IllegalArgumentException("GitLab 绑定不属于当前项目");
        }

        String name = request.name().trim();
        boolean duplicated = createMode
                ? aiClubPipelineRepository.existsByProject_IdAndName(project.getId(), name)
                : aiClubPipelineRepository.existsByProject_IdAndNameAndIdNot(project.getId(), name, entity.getId());
        if (duplicated) {
            throw new IllegalArgumentException("同一项目下已存在同名流水线");
        }

        entity.setProject(project);
        entity.setGitlabBinding(gitlabBinding);
        entity.setName(name);
        entity.setProviderCode(AiClubPipelineEntity.PROVIDER_WOODPECKER);
        entity.setDefaultBranch(trimToNull(request.defaultBranch()));
        entity.setConfigPath(normalizeConfigPath(request.configPath()));
        entity.setTriggerVariablesJson(normalizeTriggerVariablesJson(request.triggerVariables()));
        entity.setEnabled(Boolean.TRUE.equals(request.enabled()));
    }

    /**
     * 创建或更新 AI Club Pipeline 时立即同步 Woodpecker 仓库，确保页面不需要维护独立服务实例。
     */
    private void syncWoodpeckerRepository(AiClubPipelineEntity entity) {
        WoodpeckerApiService.WoodpeckerRepository repository = woodpeckerPipelineProvider.syncRepository(entity.getGitlabBinding());
        entity.setWoodpeckerRepoId(repository.id());
        entity.setWoodpeckerRepoFullName(trimToNull(repository.fullName()));
        entity.setWoodpeckerRepoUrl(trimToNull(woodpeckerPipelineProvider.resolveRepoUrl(repository, entity.getGitlabBinding())));
    }

    private AiClubPipelineTriggerResult triggerAiClubPipeline(AiClubPipelineEntity entity, String branchOverride, String sourceDescription) {
        LocalDateTime now = LocalDateTime.now();
        try {
            String branch = resolveAiClubPipelineBranch(entity, branchOverride);
            ensureAiClubPipelineConfigPresent(entity, branch);
            WoodpeckerApiService.WoodpeckerPipeline run = woodpeckerPipelineProvider.triggerPipeline(
                    entity,
                    branch,
                    sourceDescription,
                    parseTriggerVariables(entity.getTriggerVariablesJson())
            );
            String triggerUrl = trimToNull(woodpeckerPipelineProvider.resolveRunUrl(entity, run));
            String message = buildAiClubPipelineTriggeredMessage(run, sourceDescription);
            entity.setLastRunStatus(defaultString(trimToNull(run.status()), "QUEUED"));
            entity.setLastRunMessage(limitMessage(message));
            entity.setLastRunNumber(run.number());
            entity.setLastRunUrl(triggerUrl);
            entity.setLastTriggeredAt(now);
            aiClubPipelineRepository.save(entity);
            pipelineAutomationService.recordTriggeredRun(entity, run, sourceDescription);
            notifyCurrentUserAiClubPipelineQueued(entity);
            return new AiClubPipelineTriggerResult(
                    entity.getId(),
                    entity.getProject().getName(),
                    entity.getName(),
                    entity.getProviderCode(),
                    run.number(),
                    defaultString(trimToNull(run.status()), "QUEUED"),
                    triggerUrl,
                    message,
                    formatTime(now)
            );
        } catch (RuntimeException exception) {
            entity.setLastRunStatus("FAILED");
            entity.setLastRunMessage(limitMessage(exception.getMessage()));
            entity.setLastTriggeredAt(now);
            aiClubPipelineRepository.save(entity);
            notifyCurrentUserAiClubPipelineFailed(entity, exception.getMessage());
            throw exception;
        }
    }

    /**
     * 触发前校验目标分支已经提交 Woodpecker 配置文件，避免“只同步仓库”被误认为“流水线已配置”。
     */
    private void ensureAiClubPipelineConfigPresent(AiClubPipelineEntity entity, String branch) {
        pipelineAutomationService.ensurePipelineConfigPresent(entity, branch);
    }

    private String resolveAiClubPipelineBranch(AiClubPipelineEntity pipeline, String branchOverride) {
        String branch = firstText(
                branchOverride,
                pipeline.getDefaultBranch(),
                pipeline.getGitlabBinding().getDefaultTargetBranch(),
                pipeline.getGitlabBinding().getProductMainBranch()
        );
        return hasText(branch) ? branch.trim() : "main";
    }

    private boolean repositoryFileExists(AiClubPipelineEntity entity, String branch, String configPath) {
        ProjectGitlabBindingEntity binding = entity.getGitlabBinding();
        String apiToken = tokenCipherService.decrypt(binding.getTokenCiphertext());
        return gitlabApiService.repositoryFileExists(
                binding.getApiBaseUrl(),
                apiToken,
                resolveAiClubPipelineProjectRef(binding),
                branch,
                configPath
        );
    }

    private String loadRepositoryFileContent(AiClubPipelineEntity entity, String branch, String configPath) {
        ProjectGitlabBindingEntity binding = entity.getGitlabBinding();
        String apiToken = tokenCipherService.decrypt(binding.getTokenCiphertext());
        return gitlabApiService.getRepositoryFileContent(
                binding.getApiBaseUrl(),
                apiToken,
                resolveAiClubPipelineProjectRef(binding),
                branch,
                configPath
        );
    }

    private AiClubPipelineConfigTemplateService.TemplateRenderContext buildTemplateRenderContext(AiClubPipelineEntity entity) {
        if (entity == null) {
            return AiClubPipelineConfigTemplateService.TemplateRenderContext.defaultPreview();
        }
        return new AiClubPipelineConfigTemplateService.TemplateRenderContext(
                entity.getId(),
                entity.getName(),
                resolveAiClubPipelineBranch(entity, null),
                trimToNull(entity.getGitlabBinding().getGitlabProjectPath())
        );
    }

    private String resolvePipelineConfigContent(AiClubPipelineEntity entity, AiClubPipelineConfigCompleteRequest request) {
        if (request.manualEdit()) {
            if (!hasText(request.content())) {
                throw new IllegalArgumentException("手动编辑的流水线配置内容不能为空");
            }
            return request.content();
        }
        return pipelineConfigTemplateService.renderTemplate(
                request.templateCode(),
                buildTemplateRenderContext(entity),
                request.parameters()
        );
    }

    /**
     * 参数化模板中的敏感字段只写入 Woodpecker repo secrets，
     * YAML 和 GitLab MR 中只保留 from_secret 引用。
     */
    private void prepareTemplateSecrets(AiClubPipelineEntity entity, AiClubPipelineConfigCompleteRequest request, boolean requireValues) {
        List<AiClubPipelineConfigTemplateService.TemplateSecret> secrets = pipelineConfigTemplateService.collectSecrets(
                request.templateCode(),
                buildTemplateRenderContext(entity),
                request.parameters(),
                !request.manualEdit() && requireValues
        );
        if (secrets.isEmpty()) {
            return;
        }
        if (entity.getWoodpeckerRepoId() == null || entity.getWoodpeckerRepoId() <= 0L) {
            syncWoodpeckerRepository(entity);
            aiClubPipelineRepository.save(entity);
        }
        if (entity.getWoodpeckerRepoId() == null || entity.getWoodpeckerRepoId() <= 0L) {
            throw new IllegalArgumentException("流水线尚未同步 Woodpecker 仓库，无法写入模板凭据");
        }
        for (AiClubPipelineConfigTemplateService.TemplateSecret secret : secrets) {
            woodpeckerApiService.upsertRepositorySecret(
                    entity.getWoodpeckerRepoId(),
                    secret.name(),
                    secret.value(),
                    secret.note(),
                    secret.events(),
                    secret.images()
            );
        }
    }

    private String resolveAiClubPipelineProjectRef(ProjectGitlabBindingEntity binding) {
        String projectRef = firstText(binding.getGitlabProjectRef(), binding.getGitlabProjectPath(), binding.getGitlabProjectId());
        if (!hasText(projectRef)) {
            throw new IllegalArgumentException("GitLab 绑定缺少项目标识，无法校验流水线配置文件");
        }
        return projectRef;
    }

    private String normalizeConfigContent(String content) {
        String normalized = (content == null ? "" : content).replace("\r\n", "\n").replace('\r', '\n');
        return normalized.endsWith("\n") ? normalized : normalized + "\n";
    }

    private String buildPipelineConfigMergeRequestDescription(AiClubPipelineEntity entity,
                                                              String branch,
                                                              String configPath,
                                                              String templateCode,
                                                              boolean configExists) {
        StringBuilder builder = new StringBuilder();
        builder.append(configExists ? "AI Club Pipeline 配置文件更新 MR\n\n" : "AI Club Pipeline 配置文件补全 MR\n\n")
                .append("- 平台项目：").append(entity.getProject().getName()).append('\n')
                .append("- 流水线：").append(entity.getName()).append('\n')
                .append("- 目标分支：").append(branch).append('\n')
                .append("- 配置文件：").append(configPath).append('\n')
                .append("- 模板：").append(defaultString(templateCode).trim().toUpperCase()).append("\n\n")
                .append(configExists ? "合并后将更新现有流水线配置，可回到 AI Club 流水线中心继续触发运行。" : "合并后可回到 AI Club 流水线中心触发运行。");
        return builder.toString();
    }

    private String buildAiClubPipelineTriggeredMessage(WoodpeckerApiService.WoodpeckerPipeline run, String sourceDescription) {
        StringBuilder builder = new StringBuilder("已触发 AI Club Pipeline");
        if (run != null && run.number() != null) {
            builder.append(" #").append(run.number());
        }
        if (hasText(sourceDescription)) {
            builder.append("（来源：").append(sourceDescription.trim()).append("）");
        }
        return builder.toString();
    }

    private void notifyCurrentUserAiClubPipelineQueued(AiClubPipelineEntity entity) {
        Long currentUserId = AuthContextHolder.get().map(authContext -> authContext.userId()).orElse(null);
        if (currentUserId == null) {
            return;
        }
        notificationService.sendToUser(
                currentUserId,
                NotificationService.TYPE_CICD,
                NotificationService.LEVEL_INFO,
                "流水线已触发",
                "项目《" + entity.getProject().getName() + "》的 AI Club Pipeline《" + entity.getName() + "》已提交。",
                "/cicd/pipeline-bindings",
                "AI_CLUB_PIPELINE",
                entity.getId()
        );
    }

    private void notifyCurrentUserAiClubPipelineFailed(AiClubPipelineEntity entity, String reason) {
        Long currentUserId = AuthContextHolder.get().map(authContext -> authContext.userId()).orElse(null);
        if (currentUserId == null) {
            return;
        }
        notificationService.sendToUser(
                currentUserId,
                NotificationService.TYPE_CICD,
                NotificationService.LEVEL_ERROR,
                "流水线触发失败",
                limitMessage("项目《" + entity.getProject().getName() + "》的 AI Club Pipeline《" + entity.getName() + "》触发失败：" + defaultString(reason)),
                "/cicd/pipeline-bindings",
                "AI_CLUB_PIPELINE",
                entity.getId()
        );
    }

    private void fillJenkinsServerEntity(JenkinsServerEntity entity, JenkinsServerRequest request, boolean createMode) {
        entity.setName(request.name().trim());
        entity.setBaseUrl(normalizeBaseUrl(request.baseUrl()));
        entity.setUsername(request.username().trim());
        entity.setDescription(defaultString(request.description()));
        entity.setEnabled(Boolean.TRUE.equals(request.enabled()));
        if (hasText(request.apiToken())) {
            entity.setTokenCiphertext(tokenCipherService.encrypt(request.apiToken().trim()));
        } else if (createMode) {
            throw new IllegalArgumentException("新增 Jenkins 服务时必须填写 API Token");
        }
    }

    private JenkinsBuildTriggerResult triggerPipelineBuild(ProjectPipelineBindingEntity entity, String branchOverride, String sourceDescription) {
        LocalDateTime now = LocalDateTime.now();
        try {
            if (!Boolean.TRUE.equals(entity.getEnabled())) {
                throw new IllegalArgumentException("当前流水线绑定未启用");
            }
            if (!Boolean.TRUE.equals(entity.getJenkinsServer().getEnabled())) {
                throw new IllegalArgumentException("关联的 Jenkins 服务未启用");
            }
            String apiToken = tokenCipherService.decrypt(entity.getJenkinsServer().getTokenCiphertext());
            Map<String, String> parameters = resolveBuildParameters(entity, apiToken, branchOverride);
            JenkinsApiService.JenkinsTriggerResult result = jenkinsApiService.triggerJob(
                    entity.getJenkinsServer().getBaseUrl(),
                    entity.getJenkinsServer().getUsername(),
                    apiToken,
                    entity.getJobName(),
                    parameters
            );
            String message = hasText(sourceDescription)
                    ? result.message() + "（来源：" + sourceDescription.trim() + "）"
                    : result.message();
            entity.setLastTriggerStatus("QUEUED");
            entity.setLastTriggerMessage(limitMessage(message));
            entity.setLastTriggeredAt(now);
            entity.setLastTriggerUrl(trimToNull(result.triggerUrl()));
            projectPipelineBindingRepository.save(entity);
            notifyCurrentUserPipelineQueued(entity);
            return new JenkinsBuildTriggerResult(
                    entity.getId(),
                    entity.getProject().getName(),
                    entity.getJenkinsServer().getName(),
                    entity.getJobName(),
                    trimToNull(result.triggerUrl()),
                    message,
                    formatTime(now)
            );
        } catch (RuntimeException exception) {
            entity.setLastTriggerStatus("FAILED");
            entity.setLastTriggerMessage(limitMessage(exception.getMessage()));
            entity.setLastTriggeredAt(now);
            projectPipelineBindingRepository.save(entity);
            notifyCurrentUserPipelineFailed(entity, exception.getMessage());
            throw exception;
        }
    }

    /**
     * 只有在 Jenkins Job 明确声明了 branch/BRANCH 参数时才自动补充分支，
     * 避免普通 Job 因被误走参数化触发路径而返回 500。
     */
    private Map<String, String> resolveBuildParameters(ProjectPipelineBindingEntity entity, String apiToken, String branchOverride) {
        BuildParameterSnapshot snapshot = parseBuildParameters(entity.getBuildParametersJson());
        String branch = trimToNull(branchOverride);
        if (branch == null) {
            branch = trimToNull(entity.getDefaultBranch());
        }
        if (branch == null || snapshot.containsExplicitBranchParameter()) {
            return snapshot.parameters();
        }

        JenkinsApiService.JenkinsJob job = jenkinsApiService.fetchJob(
                entity.getJenkinsServer().getBaseUrl(),
                entity.getJenkinsServer().getUsername(),
                apiToken,
                entity.getJobName()
        );
        String branchParameterName = resolveBranchParameterName(job.parameterNames());
        if (branchParameterName == null) {
            return snapshot.parameters();
        }

        Map<String, String> parameters = new LinkedHashMap<>(snapshot.parameters());
        parameters.put(branchParameterName, branch);
        return parameters;
    }

    private void notifyCurrentUserPipelineQueued(ProjectPipelineBindingEntity entity) {
        Long currentUserId = AuthContextHolder.get().map(authContext -> authContext.userId()).orElse(null);
        if (currentUserId == null) {
            return;
        }
        notificationService.sendToUser(
                currentUserId,
                NotificationService.TYPE_CICD,
                NotificationService.LEVEL_INFO,
                "流水线已触发",
                "项目《" + entity.getProject().getName() + "》的 Jenkins Job《" + entity.getJobName() + "》已进入队列。",
                "/cicd",
                "PIPELINE_BINDING",
                entity.getId()
        );
    }

    private void notifyCurrentUserPipelineFailed(ProjectPipelineBindingEntity entity, String reason) {
        Long currentUserId = AuthContextHolder.get().map(authContext -> authContext.userId()).orElse(null);
        if (currentUserId == null) {
            return;
        }
        notificationService.sendToUser(
                currentUserId,
                NotificationService.TYPE_CICD,
                NotificationService.LEVEL_ERROR,
                "流水线触发失败",
                limitMessage("项目《" + entity.getProject().getName() + "》的 Jenkins Job《" + entity.getJobName() + "》触发失败：" + defaultString(reason)),
                "/cicd",
                "PIPELINE_BINDING",
                entity.getId()
        );
    }

    private void fillPipelineBindingEntity(ProjectPipelineBindingEntity entity, ProjectPipelineBindingRequest request, boolean createMode) {
        ProjectEntity project = requireProject(request.projectId());
        JenkinsServerEntity jenkinsServer = requireJenkinsServer(request.jenkinsServerId());

        String jobName = request.jobName().trim();
        String apiToken = tokenCipherService.decrypt(jenkinsServer.getTokenCiphertext());
        JenkinsApiService.JenkinsJob job = jenkinsApiService.fetchJob(jenkinsServer.getBaseUrl(), jenkinsServer.getUsername(), apiToken, jobName);

        entity.setProject(project);
        entity.setJenkinsServer(jenkinsServer);
        entity.setJobName(jobName);
        entity.setJobUrl(trimToNull(job.url()));
        entity.setDefaultBranch(trimToNull(request.defaultBranch()));
        entity.setBuildParametersJson(normalizeBuildParametersJson(request.buildParametersJson()));
        entity.setEnabled(Boolean.TRUE.equals(request.enabled()));

        if (job.lastBuild() != null && !createMode) {
            entity.setLastTriggerStatus(trimToNull(job.lastBuild().result()));
            entity.setLastTriggerMessage("最近构建 #" + job.lastBuild().number());
            entity.setLastTriggeredAt(toLocalDateTime(job.lastBuild().timestamp()));
            entity.setLastTriggerUrl(trimToNull(job.lastBuild().url()));
        }
    }

    /**
     * 汇总同一项目下多条流水线的触发结果，兼容 AI Club Pipeline 与 Jenkins legacy 混合场景。
     */
    private PipelineTriggerOutcome buildProjectPipelineOutcome(List<PipelineBindingOutcome> bindingOutcomes) {
        if (bindingOutcomes == null || bindingOutcomes.isEmpty()) {
            return PipelineTriggerOutcome.skipped("当前项目未配置可触发的流水线");
        }
        if (bindingOutcomes.size() == 1) {
            PipelineBindingOutcome bindingOutcome = bindingOutcomes.get(0);
            return switch (bindingOutcome.status()) {
                case "SUCCESS" -> PipelineTriggerOutcome.success(bindingOutcome.message(), bindingOutcomes);
                case "FAILED" -> PipelineTriggerOutcome.failed(bindingOutcome.message(), bindingOutcomes);
                default -> PipelineTriggerOutcome.skipped(bindingOutcome.message(), bindingOutcomes);
            };
        }

        long successCount = bindingOutcomes.stream().filter(item -> "SUCCESS".equalsIgnoreCase(item.status())).count();
        long failedCount = bindingOutcomes.stream().filter(item -> "FAILED".equalsIgnoreCase(item.status())).count();
        long skippedCount = bindingOutcomes.size() - successCount - failedCount;

        if (successCount == bindingOutcomes.size()) {
            return PipelineTriggerOutcome.success("已触发 " + successCount + " 条流水线", bindingOutcomes);
        }
        if (failedCount == bindingOutcomes.size()) {
            return PipelineTriggerOutcome.failed("共 " + failedCount + " 条流水线触发失败", bindingOutcomes);
        }
        if (skippedCount == bindingOutcomes.size()) {
            return PipelineTriggerOutcome.skipped("共 " + skippedCount + " 条流水线未触发", bindingOutcomes);
        }
        return PipelineTriggerOutcome.partial(
                "共 " + bindingOutcomes.size() + " 条绑定，成功 " + successCount + " 条，失败 " + failedCount + " 条，跳过 " + skippedCount + " 条",
                bindingOutcomes
        );
    }

    private BuildParameterSnapshot parseBuildParameters(String buildParametersJson) {
        Map<String, String> parameters = new LinkedHashMap<>();
        boolean containsExplicitBranchParameter = false;
        String normalizedJson = trimToNull(buildParametersJson);
        if (normalizedJson != null) {
            try {
                JsonNode node = objectMapper.readTree(normalizedJson);
                if (!node.isObject()) {
                    throw new IllegalArgumentException("构建参数必须为 JSON 对象");
                }
                var fields = node.fields();
                while (fields.hasNext()) {
                    Map.Entry<String, JsonNode> entry = fields.next();
                    parameters.put(entry.getKey(), entry.getValue().isNull() ? "" : entry.getValue().asText(""));
                    if ("branch".equalsIgnoreCase(entry.getKey())) {
                        containsExplicitBranchParameter = true;
                    }
                }
            } catch (IllegalArgumentException exception) {
                throw exception;
            } catch (Exception exception) {
                throw new IllegalArgumentException("构建参数 JSON 格式不正确");
            }
        }
        return new BuildParameterSnapshot(Map.copyOf(parameters), containsExplicitBranchParameter);
    }

    private String normalizeBuildParametersJson(String value) {
        String json = trimToNull(value);
        if (json == null) {
            return null;
        }
        try {
            JsonNode node = objectMapper.readTree(json);
            if (!node.isObject()) {
                throw new IllegalArgumentException("构建参数必须为 JSON 对象，例如 {\"branch\":\"main\"}");
            }
            return objectMapper.writeValueAsString(node);
        } catch (IllegalArgumentException exception) {
            throw exception;
        } catch (Exception exception) {
                throw new IllegalArgumentException("构建参数 JSON 格式不正确");
        }
    }

    /**
     * 固定触发变量只支持普通 key/value，用于让同一份 .woodpecker.yml 通过变量区分不同部署目标。
     */
    private String normalizeTriggerVariablesJson(Map<String, String> variables) {
        Map<String, String> normalized = normalizeTriggerVariablesMap(variables);
        if (normalized.isEmpty()) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(normalized);
        } catch (Exception exception) {
            throw new IllegalArgumentException("固定触发变量序列化失败");
        }
    }

    private Map<String, String> parseTriggerVariables(String json) {
        String normalizedJson = trimToNull(json);
        if (normalizedJson == null) {
            return Map.of();
        }
        try {
            JsonNode node = objectMapper.readTree(normalizedJson);
            if (!node.isObject()) {
                throw new IllegalArgumentException("固定触发变量必须为 JSON 对象");
            }
            Map<String, String> variables = new LinkedHashMap<>();
            var fields = node.fields();
            while (fields.hasNext()) {
                Map.Entry<String, JsonNode> entry = fields.next();
                variables.put(entry.getKey(), entry.getValue().isNull() ? "" : entry.getValue().asText(""));
            }
            return Map.copyOf(variables);
        } catch (IllegalArgumentException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IllegalArgumentException("固定触发变量 JSON 格式不正确");
        }
    }

    private Map<String, String> normalizeTriggerVariablesMap(Map<String, String> variables) {
        if (variables == null || variables.isEmpty()) {
            return Map.of();
        }
        Map<String, String> normalized = new LinkedHashMap<>();
        Set<String> duplicateCheck = new LinkedHashSet<>();
        variables.forEach((rawKey, rawValue) -> {
            String key = trimToNull(rawKey);
            if (key == null) {
                return;
            }
            if (!key.matches("[A-Za-z_][A-Za-z0-9_]*")) {
                throw new IllegalArgumentException("固定触发变量名仅支持字母、数字和下划线，且不能以数字开头");
            }
            if (key.toUpperCase().startsWith("AI_CLUB_")) {
                throw new IllegalArgumentException("固定触发变量名不能以 AI_CLUB_ 开头");
            }
            if (RESERVED_TRIGGER_VARIABLE_KEYS.contains(key)) {
                throw new IllegalArgumentException("固定触发变量名不能覆盖平台保留变量: " + key);
            }
            if (!duplicateCheck.add(key)) {
                throw new IllegalArgumentException("固定触发变量名不能重复: " + key);
            }
            normalized.put(key, rawValue == null ? "" : rawValue.trim());
        });
        return Map.copyOf(normalized);
    }

    private String buildServerTestMessage(JenkinsApiService.JenkinsServerInfo info) {
        StringBuilder builder = new StringBuilder("连接成功");
        if (hasText(info.version())) {
            builder.append("，版本：").append(info.version().trim());
        }
        if (hasText(info.primaryViewName())) {
            builder.append("，默认视图：").append(info.primaryViewName().trim());
        }
        builder.append("，Job 数：").append(info.jobCount());
        return limitMessage(builder.toString());
    }

    private AiClubPipelineSummary toAiClubPipelineSummary(AiClubPipelineEntity entity) {
        ProjectGitlabBindingEntity binding = entity.getGitlabBinding();
        return new AiClubPipelineSummary(
                entity.getId(),
                entity.getProject().getId(),
                entity.getProject().getName(),
                binding.getId(),
                firstText(binding.getGitlabProjectName(), binding.getGitlabProjectRef()),
                firstText(binding.getGitlabProjectPath(), binding.getGitlabProjectRef()),
                trimToNull(binding.getGitlabProjectWebUrl()),
                entity.getName(),
                entity.getProviderCode(),
                entity.getDefaultBranch(),
                entity.getConfigPath(),
                parseTriggerVariables(entity.getTriggerVariablesJson()),
                entity.getWoodpeckerRepoId(),
                entity.getWoodpeckerRepoFullName(),
                entity.getWoodpeckerRepoUrl(),
                defaultBoolean(entity.getEnabled(), true),
                entity.getLastRunStatus(),
                entity.getLastRunMessage(),
                entity.getLastRunNumber(),
                entity.getLastRunUrl(),
                formatTime(entity.getLastTriggeredAt()),
                pipelineAutomationService.countCronJobs(entity.getId()),
                pipelineAutomationService.isTriggerWebhookEnabled(entity.getId()),
                pipelineAutomationService.isCallbackWebhookEnabled(entity.getId()),
                pipelineAutomationService.listCallbackSubscribedStatuses(entity.getId())
        );
    }

    private AiClubPipelineRunSummary toAiClubPipelineRunSummary(WoodpeckerApiService.WoodpeckerPipeline run) {
        Long durationMillis = calculateDurationMillis(run.startedAt(), run.finishedAt());
        return new AiClubPipelineRunSummary(
                run.number(),
                trimToNull(run.status()),
                trimToNull(run.branch()),
                trimToNull(run.event()),
                trimToNull(run.message()),
                trimToNull(run.commit()),
                trimToNull(run.forgeUrl()),
                formatTime(run.createdAt()),
                formatTime(run.startedAt()),
                formatTime(run.finishedAt()),
                durationMillis,
                formatDuration(durationMillis == null ? 0L : durationMillis)
        );
    }

    private JenkinsServerSummary toJenkinsServerSummary(JenkinsServerEntity entity) {
        return new JenkinsServerSummary(
                entity.getId(),
                entity.getName(),
                entity.getBaseUrl(),
                entity.getUsername(),
                entity.getDescription(),
                defaultBoolean(entity.getEnabled(), true),
                hasText(entity.getTokenCiphertext()),
                entity.getLastTestStatus(),
                entity.getLastTestMessage(),
                formatTime(entity.getLastTestedAt()),
                entity.getLastJobCount()
        );
    }

    private JenkinsJobSummary toJenkinsJobSummary(JenkinsApiService.JenkinsJob job) {
        return new JenkinsJobSummary(
                job.name(),
                job.fullName(),
                job.url(),
                job.color(),
                job.lastBuild() == null ? null : job.lastBuild().number(),
                job.lastBuild() == null ? null : trimToNull(job.lastBuild().result()),
                job.lastBuild() == null ? null : trimToNull(job.lastBuild().url()),
                job.lastBuild() == null ? null : formatTime(toLocalDateTime(job.lastBuild().timestamp()))
        );
    }

    private JenkinsBuildSummary toBuildSummary(JenkinsApiService.JenkinsBuildInfo build) {
        return new JenkinsBuildSummary(
                build.number(),
                trimToNull(build.url()),
                trimToNull(build.result()),
                build.building(),
                formatTime(toLocalDateTime(build.timestamp())),
                build.duration(),
                formatDuration(build.duration()),
                trimToNull(build.description())
        );
    }

    private PipelineCenterEntryEnvelope toPipelineCenterAiClubEntry(AiClubPipelineEntity entity) {
        ProjectGitlabBindingEntity binding = entity.getGitlabBinding();
        return new PipelineCenterEntryEnvelope(
                PIPELINE_CENTER_ENTRY_AI_CLUB,
                entity.getId(),
                entity.getLastTriggeredAt(),
                new PipelineCenterEntrySummary(
                        PIPELINE_CENTER_ENTRY_AI_CLUB,
                        entity.getId(),
                        entity.getProject().getId(),
                        entity.getProject().getName(),
                        entity.getName(),
                        entity.getProviderCode(),
                        entity.getDefaultBranch(),
                        defaultBoolean(entity.getEnabled(), true),
                        entity.getLastRunStatus(),
                        entity.getLastRunMessage(),
                        formatTime(entity.getLastTriggeredAt()),
                        "仓库",
                        firstText(binding.getGitlabProjectPath(), binding.getGitlabProjectRef()),
                        trimToNull(firstText(binding.getGitlabProjectWebUrl(), entity.getWoodpeckerRepoUrl())),
                        "配置",
                        entity.getConfigPath(),
                        null,
                        pipelineAutomationService.countCronJobs(entity.getId()),
                        pipelineAutomationService.isTriggerWebhookEnabled(entity.getId()),
                        pipelineAutomationService.isCallbackWebhookEnabled(entity.getId())
                )
        );
    }

    private PipelineCenterEntryEnvelope toPipelineCenterJenkinsEntry(ProjectPipelineBindingEntity entity) {
        return new PipelineCenterEntryEnvelope(
                PIPELINE_CENTER_ENTRY_JENKINS,
                entity.getId(),
                entity.getLastTriggeredAt(),
                new PipelineCenterEntrySummary(
                        PIPELINE_CENTER_ENTRY_JENKINS,
                        entity.getId(),
                        entity.getProject().getId(),
                        entity.getProject().getName(),
                        entity.getJobName(),
                        "JENKINS",
                        entity.getDefaultBranch(),
                        defaultBoolean(entity.getEnabled(), true),
                        entity.getLastTriggerStatus(),
                        entity.getLastTriggerMessage(),
                        formatTime(entity.getLastTriggeredAt()),
                        "Jenkins Job",
                        entity.getJobName(),
                        trimToNull(entity.getJobUrl()),
                        "Jenkins 服务",
                        entity.getJenkinsServer().getName(),
                        null,
                        0L,
                        false,
                        false
                )
        );
    }

    private ProjectPipelineBindingSummary toPipelineBindingSummary(ProjectPipelineBindingEntity entity) {
        return new ProjectPipelineBindingSummary(
                entity.getId(),
                entity.getProject().getId(),
                entity.getProject().getName(),
                entity.getJenkinsServer().getId(),
                entity.getJenkinsServer().getName(),
                entity.getJobName(),
                entity.getJobUrl(),
                entity.getDefaultBranch(),
                entity.getBuildParametersJson(),
                defaultBoolean(entity.getEnabled(), true),
                entity.getLastTriggerStatus(),
                entity.getLastTriggerMessage(),
                formatTime(entity.getLastTriggeredAt()),
                entity.getLastTriggerUrl()
        );
    }

    private Pageable buildPageable(int page, int size, Sort sort) {
        int safePage = Math.max(page, 1);
        int safeSize = Math.max(1, Math.min(size, 100));
        return PageRequest.of(safePage - 1, safeSize, sort);
    }

    private Specification<JenkinsServerEntity> jenkinsServerSpecification(String keyword, Boolean enabled) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (hasText(keyword)) {
                String pattern = "%" + keyword.trim().toLowerCase() + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("name")), pattern),
                        cb.like(cb.lower(root.get("baseUrl")), pattern),
                        cb.like(cb.lower(root.get("username")), pattern),
                        cb.like(cb.lower(root.get("description")), pattern)
                ));
            }
            if (enabled != null) {
                predicates.add(cb.equal(root.get("enabled"), enabled));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    private Specification<ProjectPipelineBindingEntity> pipelineBindingSpecification(String keyword, Long serverId, Boolean enabled,
                                                                                    ProjectDataPermissionService.ProjectDataScope scope) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            appendProjectVisibilityPredicate(predicates, root.join("project", JoinType.INNER), query, cb, scope);
            if (hasText(keyword)) {
                String pattern = "%" + keyword.trim().toLowerCase() + "%";
                var projectJoin = root.join("project", JoinType.LEFT);
                var serverJoin = root.join("jenkinsServer", JoinType.LEFT);
                predicates.add(cb.or(
                        cb.like(cb.lower(projectJoin.get("name")), pattern),
                        cb.like(cb.lower(serverJoin.get("name")), pattern),
                        cb.like(cb.lower(root.get("jobName")), pattern),
                        cb.like(cb.lower(root.get("defaultBranch")), pattern)
                ));
            }
            if (serverId != null) {
                predicates.add(cb.equal(root.get("jenkinsServer").get("id"), serverId));
            }
            if (enabled != null) {
                predicates.add(cb.equal(root.get("enabled"), enabled));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    private Specification<AiClubPipelineEntity> aiClubPipelineSpecification(String keyword, Long projectId, Boolean enabled,
                                                                            ProjectDataPermissionService.ProjectDataScope scope) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            jakarta.persistence.criteria.Join<AiClubPipelineEntity, ProjectEntity> projectJoin = root.join("project", JoinType.INNER);
            var bindingJoin = root.join("gitlabBinding", JoinType.LEFT);
            appendProjectVisibilityPredicate(predicates, projectJoin, query, cb, scope);
            if (projectId != null) {
                predicates.add(cb.equal(projectJoin.get("id"), projectId));
            }
            if (hasText(keyword)) {
                String pattern = "%" + keyword.trim().toLowerCase() + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(projectJoin.get("name")), pattern),
                        cb.like(cb.lower(bindingJoin.get("gitlabProjectRef")), pattern),
                        cb.like(cb.lower(bindingJoin.get("gitlabProjectName")), pattern),
                        cb.like(cb.lower(bindingJoin.get("gitlabProjectPath")), pattern),
                        cb.like(cb.lower(root.get("name")), pattern),
                        cb.like(cb.lower(root.get("defaultBranch")), pattern),
                        cb.like(cb.lower(root.get("configPath")), pattern),
                        cb.like(cb.lower(root.get("woodpeckerRepoFullName")), pattern)
                ));
            }
            if (enabled != null) {
                predicates.add(cb.equal(root.get("enabled"), enabled));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    /**
     * 为项目流水线查询统一追加项目可见范围条件。
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

    private ProjectEntity requireProject(Long id) {
        ProjectEntity project = projectRepository.findById(id).orElseThrow(() -> new NoSuchElementException("项目不存在: " + id));
        ProjectDataPermissionService.ProjectDataScope scope = projectDataPermissionService.currentScopeOrNull();
        if (scope != null) {
            projectDataPermissionService.requireProjectVisible(project, scope);
        }
        return project;
    }

    private JenkinsServerEntity requireJenkinsServer(Long id) {
        return jenkinsServerRepository.findById(id).orElseThrow(() -> new NoSuchElementException("Jenkins 服务不存在: " + id));
    }

    private ProjectGitlabBindingEntity requireGitlabBinding(Long id) {
        ProjectGitlabBindingEntity binding = projectGitlabBindingRepository.findById(id).orElseThrow(() -> new NoSuchElementException("GitLab 绑定不存在: " + id));
        ProjectDataPermissionService.ProjectDataScope scope = projectDataPermissionService.currentScopeOrNull();
        if (scope != null) {
            projectDataPermissionService.requireProjectVisible(binding.getProject(), scope);
        }
        return binding;
    }

    private AiClubPipelineEntity requireAiClubPipeline(Long id) {
        AiClubPipelineEntity pipeline = aiClubPipelineRepository.findById(id).orElseThrow(() -> new NoSuchElementException("AI Club Pipeline 不存在: " + id));
        ProjectDataPermissionService.ProjectDataScope scope = projectDataPermissionService.currentScopeOrNull();
        if (scope != null) {
            projectDataPermissionService.requireProjectVisible(pipeline.getProject(), scope);
        }
        return pipeline;
    }

    private ProjectPipelineBindingEntity requirePipelineBinding(Long id) {
        ProjectPipelineBindingEntity binding = projectPipelineBindingRepository.findById(id).orElseThrow(() -> new NoSuchElementException("项目流水线绑定不存在: " + id));
        ProjectDataPermissionService.ProjectDataScope scope = projectDataPermissionService.currentScopeOrNull();
        if (scope != null) {
            projectDataPermissionService.requirePipelineBindingVisible(binding);
        }
        return binding;
    }

    private String normalizePipelineCenterEntryType(String entryType) {
        String normalized = trimToNull(entryType);
        if (normalized == null) {
            return null;
        }
        normalized = normalized.toUpperCase();
        if (!PIPELINE_CENTER_ENTRY_AI_CLUB.equals(normalized) && !PIPELINE_CENTER_ENTRY_JENKINS.equals(normalized)) {
            throw new IllegalArgumentException("entryType 仅支持 AI_CLUB 或 JENKINS");
        }
        return normalized;
    }

    private LocalDateTime toLocalDateTime(long timestamp) {
        if (timestamp <= 0) {
            return null;
        }
        return LocalDateTime.ofInstant(Instant.ofEpochMilli(timestamp), ZoneId.systemDefault());
    }

    private String normalizeBaseUrl(String value) {
        String baseUrl = trimToNull(value);
        if (baseUrl == null) {
            throw new IllegalArgumentException("Jenkins 地址不能为空");
        }
        while (baseUrl.endsWith("/")) {
            baseUrl = baseUrl.substring(0, baseUrl.length() - 1);
        }
        return baseUrl;
    }

    private String defaultString(String value) {
        return value == null ? "" : value.trim();
    }

    private String defaultString(String value, String fallback) {
        return hasText(value) ? value.trim() : fallback;
    }

    private String firstText(String... values) {
        if (values == null) {
            return null;
        }
        for (String value : values) {
            if (hasText(value)) {
                return value.trim();
            }
        }
        return null;
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
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

    private String formatDuration(long durationMillis) {
        if (durationMillis <= 0) {
            return "0秒";
        }
        long totalSeconds = durationMillis / 1000;
        long hours = totalSeconds / 3600;
        long minutes = (totalSeconds % 3600) / 60;
        long seconds = totalSeconds % 60;
        List<String> parts = new ArrayList<>();
        if (hours > 0) {
            parts.add(hours + "小时");
        }
        if (minutes > 0) {
            parts.add(minutes + "分钟");
        }
        if (seconds > 0 || parts.isEmpty()) {
            parts.add(seconds + "秒");
        }
        return String.join("", parts);
    }

    private Long calculateDurationMillis(LocalDateTime startedAt, LocalDateTime finishedAt) {
        if (startedAt == null || finishedAt == null || finishedAt.isBefore(startedAt)) {
            return null;
        }
        return java.time.Duration.between(startedAt, finishedAt).toMillis();
    }

    private String normalizeConfigPath(String value) {
        String configPath = trimToNull(value);
        if (configPath == null) {
            return ".woodpecker.yml";
        }
        String normalized = configPath.replace('\\', '/');
        while (normalized.startsWith("/")) {
            normalized = normalized.substring(1);
        }
        if (normalized.contains("..")) {
            throw new IllegalArgumentException("流水线配置路径不能包含 ..");
        }
        return normalized;
    }

    private String limitMessage(String message) {
        if (!hasText(message)) {
            return "执行失败";
        }
        String value = message.trim();
        return value.length() > 500 ? value.substring(0, 500) : value;
    }

    /**
     * 优先匹配常见的 branch / BRANCH 参数名，并兼容大小写不同的自定义命名。
     */
    private String resolveBranchParameterName(List<String> parameterNames) {
        if (parameterNames == null || parameterNames.isEmpty()) {
            return null;
        }
        for (String parameterName : parameterNames) {
            if ("branch".equals(parameterName)) {
                return parameterName;
            }
        }
        for (String parameterName : parameterNames) {
            if ("BRANCH".equals(parameterName)) {
                return parameterName;
            }
        }
        for (String parameterName : parameterNames) {
            if ("branch".equalsIgnoreCase(parameterName)) {
                return parameterName;
            }
        }
        return null;
    }

    /**
     * 构建参数快照，用于区分显式配置的参数和系统自动补充的默认分支。
     */
    private record BuildParameterSnapshot(
            Map<String, String> parameters,
            boolean containsExplicitBranchParameter
    ) {
    }

    public record PipelineTriggerOutcome(
            String status,
            String message,
            List<PipelineBindingOutcome> bindingOutcomes
    ) {
        /**
         * 构建整体触发成功结果。
         */
        public static PipelineTriggerOutcome success(String message, List<PipelineBindingOutcome> bindingOutcomes) {
            return new PipelineTriggerOutcome("SUCCESS", message, List.copyOf(bindingOutcomes));
        }

        /**
         * 构建整体触发失败结果。
         */
        public static PipelineTriggerOutcome failed(String message, List<PipelineBindingOutcome> bindingOutcomes) {
            return new PipelineTriggerOutcome("FAILED", message, List.copyOf(bindingOutcomes));
        }

        /**
         * 构建整体触发跳过结果。
         */
        public static PipelineTriggerOutcome skipped(String message, List<PipelineBindingOutcome> bindingOutcomes) {
            return new PipelineTriggerOutcome("SKIPPED", message, List.copyOf(bindingOutcomes));
        }

        /**
         * 构建部分成功的聚合结果。
         */
        public static PipelineTriggerOutcome partial(String message, List<PipelineBindingOutcome> bindingOutcomes) {
            return new PipelineTriggerOutcome("PARTIAL", message, List.copyOf(bindingOutcomes));
        }

        /**
         * 构建没有任何绑定时的跳过结果。
         */
        public static PipelineTriggerOutcome skipped(String message) {
            return skipped(message, List.of());
        }
    }

    /**
     * 单条流水线触发结果，用于 AI Club Pipeline 与 Jenkins legacy 混合触发时逐条回显。
     */
    public record PipelineBindingOutcome(
            String status,
            String message,
            String triggerUrl,
            String jobName,
            String jenkinsServerName
    ) {
        /**
         * 构建单条绑定的成功结果。
         */
        public static PipelineBindingOutcome success(String message, String triggerUrl, String jobName, String jenkinsServerName) {
            return new PipelineBindingOutcome("SUCCESS", message, triggerUrl, jobName, jenkinsServerName);
        }

        /**
         * 构建单条绑定的失败结果。
         */
        public static PipelineBindingOutcome failed(String message, String jobName, String jenkinsServerName) {
            return new PipelineBindingOutcome("FAILED", message, null, jobName, jenkinsServerName);
        }

        /**
         * 构建单条绑定的跳过结果。
         */
        public static PipelineBindingOutcome skipped(String message, String jobName, String jenkinsServerName) {
            return new PipelineBindingOutcome("SKIPPED", message, null, jobName, jenkinsServerName);
        }
    }

    private record PipelineCenterEntryEnvelope(
            String entryType,
            Long entryId,
            LocalDateTime lastTriggeredAt,
            PipelineCenterEntrySummary summary
    ) {
    }
}
