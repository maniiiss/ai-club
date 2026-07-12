package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.GiteeWorkItemSyncLogEntity;
import com.aiclub.platform.domain.model.IterationEntity;
import com.aiclub.platform.domain.model.IterationGiteeBindingEntity;
import com.aiclub.platform.domain.model.ProjectGiteeBindingEntity;
import com.aiclub.platform.domain.model.TaskEntity;
import com.aiclub.platform.domain.model.TaskGiteeBindingEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.GiteeWorkItemSyncLogSummary;
import com.aiclub.platform.dto.GiteeWorkItemSyncResult;
import com.aiclub.platform.repository.GiteeWorkItemSyncLogRepository;
import com.aiclub.platform.repository.IterationGiteeBindingRepository;
import com.aiclub.platform.repository.IterationRepository;
import com.aiclub.platform.repository.ProjectGiteeBindingRepository;
import com.aiclub.platform.repository.TaskGiteeBindingRepository;
import com.aiclub.platform.repository.TaskRepository;
import com.aiclub.platform.repository.UserRepository;
import com.aiclub.platform.security.AuthContextHolder;
import com.aiclub.platform.util.RequirementDocumentUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.security.SecureRandom;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Set;

/**
 * 按迭代绑定的 Gitee Scrum Sprint 手动拉取 issue，并同步到本地工作项。
 * 第一版只做单向导入，不回写评论、附件或测试结果。
 * 这里继续复用历史的 milestone 命名字段，只是为了兼容既有表结构。
 */
@Service
@Transactional(readOnly = true)
public class GiteeWorkItemSyncService {

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final String WORK_ITEM_CODE_PREFIX = "#";
    private static final String WORK_ITEM_CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    private static final int WORK_ITEM_CODE_RANDOM_LENGTH = 6;
    private static final Set<String> NORMAL_PRIORITIES = Set.of("高", "中", "低");
    private static final Map<String, String> GITEE_PRIORITY_MAPPING = Map.of(
            "0", "高",
            "1", "中",
            "2", "低",
            "3", "低",
            "P0", "高",
            "P1", "中",
            "P2", "低",
            "P3", "低"
    );

    private final IterationRepository iterationRepository;
    private final IterationGiteeBindingRepository iterationGiteeBindingRepository;
    private final ProjectGiteeBindingRepository projectGiteeBindingRepository;
    private final TaskRepository taskRepository;
    private final TaskGiteeBindingRepository taskGiteeBindingRepository;
    private final GiteeWorkItemSyncLogRepository giteeWorkItemSyncLogRepository;
    private final UserRepository userRepository;
    private final ProjectDataPermissionService projectDataPermissionService;
    private final GiteeApiService giteeApiService;
    private final TokenCipherService tokenCipherService;
    private final KnowledgeGraphService knowledgeGraphService;
    private final PlatformEnvVarResolver platformEnvVarResolver;
    private final TaskUpdateRecordService taskUpdateRecordService;
    private final SecureRandom workItemCodeRandom = new SecureRandom();
    @org.springframework.beans.factory.annotation.Value("${platform.gitee.default-api-url:}")
    private String defaultApiUrl = "";

    @Autowired
    public GiteeWorkItemSyncService(IterationRepository iterationRepository,
                                    IterationGiteeBindingRepository iterationGiteeBindingRepository,
                                    ProjectGiteeBindingRepository projectGiteeBindingRepository,
                                    TaskRepository taskRepository,
                                    TaskGiteeBindingRepository taskGiteeBindingRepository,
                                    GiteeWorkItemSyncLogRepository giteeWorkItemSyncLogRepository,
                                    UserRepository userRepository,
                                    ProjectDataPermissionService projectDataPermissionService,
                                    GiteeApiService giteeApiService,
                                    TokenCipherService tokenCipherService,
                                    KnowledgeGraphService knowledgeGraphService,
                                    PlatformEnvVarResolver platformEnvVarResolver,
                                    TaskUpdateRecordService taskUpdateRecordService) {
        this.iterationRepository = iterationRepository;
        this.iterationGiteeBindingRepository = iterationGiteeBindingRepository;
        this.projectGiteeBindingRepository = projectGiteeBindingRepository;
        this.taskRepository = taskRepository;
        this.taskGiteeBindingRepository = taskGiteeBindingRepository;
        this.giteeWorkItemSyncLogRepository = giteeWorkItemSyncLogRepository;
        this.userRepository = userRepository;
        this.projectDataPermissionService = projectDataPermissionService;
        this.giteeApiService = giteeApiService;
        this.tokenCipherService = tokenCipherService;
        this.knowledgeGraphService = knowledgeGraphService;
        this.platformEnvVarResolver = platformEnvVarResolver;
        this.taskUpdateRecordService = taskUpdateRecordService;
    }

    /** 兼容直接构造同步服务的历史单元测试。 */
    public GiteeWorkItemSyncService(IterationRepository iterationRepository,
                                    IterationGiteeBindingRepository iterationGiteeBindingRepository,
                                    ProjectGiteeBindingRepository projectGiteeBindingRepository,
                                    TaskRepository taskRepository,
                                    TaskGiteeBindingRepository taskGiteeBindingRepository,
                                    GiteeWorkItemSyncLogRepository giteeWorkItemSyncLogRepository,
                                    UserRepository userRepository,
                                    ProjectDataPermissionService projectDataPermissionService,
                                    GiteeApiService giteeApiService,
                                    TokenCipherService tokenCipherService,
                                    KnowledgeGraphService knowledgeGraphService,
                                    PlatformEnvVarResolver platformEnvVarResolver) {
        this(iterationRepository, iterationGiteeBindingRepository, projectGiteeBindingRepository, taskRepository,
                taskGiteeBindingRepository, giteeWorkItemSyncLogRepository, userRepository, projectDataPermissionService,
                giteeApiService, tokenCipherService, knowledgeGraphService, platformEnvVarResolver, null);
    }

    @Transactional
    public GiteeWorkItemSyncResult syncIterationWorkItems(Long iterationId) {
        IterationEntity iteration = requireIteration(iterationId);
        IterationGiteeBindingEntity iterationBinding = requireIterationBinding(iterationId);
        ProjectGiteeBindingEntity projectBinding = requireProjectBinding(iteration.getProject().getId());
        UserEntity operator = currentUserOrNull();
        LocalDateTime now = LocalDateTime.now();

        int createdCount = 0;
        int updatedCount = 0;
        int removedCount = 0;
        int failedCount = 0;
        int totalIssueCount = 0;
        String executionStatus;
        String summaryMessage;
        Long enterpriseId = resolveEnterpriseId(projectBinding);
        String apiBaseUrl = resolveApiBaseUrl(projectBinding);

        try {
            String accessToken = resolveAccessToken(projectBinding);
            List<GiteeApiService.GiteeIssue> remoteIssues = giteeApiService.listIssues(
                    apiBaseUrl,
                    accessToken,
                    enterpriseId,
                    projectBinding.getGiteeProgramId(),
                    iterationBinding.getGiteeMilestoneId()
            );
            totalIssueCount = remoteIssues.size();
            GiteeUserBindingIndex userBindingIndex = buildGiteeUserBindingIndex();

            Map<Long, TaskGiteeBindingEntity> existingBindingsByIssueId = new LinkedHashMap<>();
            List<Long> remoteIssueIds = remoteIssues.stream().map(GiteeApiService.GiteeIssue::id).toList();
            if (!remoteIssueIds.isEmpty()) {
                taskGiteeBindingRepository.findAllByEnterpriseIdAndGiteeIssueIdIn(enterpriseId, remoteIssueIds)
                        .forEach(item -> existingBindingsByIssueId.put(item.getGiteeIssueId(), item));
            }

            Set<Long> seenIssueIds = new LinkedHashSet<>();
            for (GiteeApiService.GiteeIssue remoteIssue : remoteIssues) {
                remoteIssue = enrichIssueWithDetailWhenDescriptionMissing(projectBinding, accessToken, remoteIssue);
                seenIssueIds.add(remoteIssue.id());
                try {
                    TaskGiteeBindingEntity existingBinding = existingBindingsByIssueId.get(remoteIssue.id());
                    if (existingBinding == null) {
                        TaskEntity createdTask = createTaskFromRemoteIssue(iteration, remoteIssue, userBindingIndex);
                        TaskGiteeBindingEntity binding = new TaskGiteeBindingEntity();
                        binding.setTask(createdTask);
                        binding.setProject(iteration.getProject());
                        binding.setIteration(iteration);
                        binding.setEnterpriseId(enterpriseId);
                        binding.setGiteeProgramId(projectBinding.getGiteeProgramId());
                        binding.setGiteeMilestoneId(iterationBinding.getGiteeMilestoneId());
                        binding.setGiteeIssueId(remoteIssue.id());
                        binding.setGiteeIssueUrl(trimToNull(remoteIssue.webUrl()));
                        binding.setLastSyncStatus("SYNCED");
                        binding.setLastSyncAt(now);
                        taskGiteeBindingRepository.save(binding);
                        createdCount++;
                    } else {
                        if (!existingBinding.getProject().getId().equals(iteration.getProject().getId())) {
                            throw new IllegalArgumentException("远端工作项已绑定到其他本地项目，无法跨项目复用");
                        }
                        updateTaskFromRemoteIssue(existingBinding.getTask(), iteration, remoteIssue, userBindingIndex);
                        existingBinding.setProject(iteration.getProject());
                        existingBinding.setIteration(iteration);
                        existingBinding.setGiteeProgramId(projectBinding.getGiteeProgramId());
                        existingBinding.setGiteeMilestoneId(iterationBinding.getGiteeMilestoneId());
                        existingBinding.setGiteeIssueUrl(trimToNull(remoteIssue.webUrl()));
                        existingBinding.setLastSyncStatus("SYNCED");
                        existingBinding.setLastSyncAt(now);
                        taskGiteeBindingRepository.save(existingBinding);
                        updatedCount++;
                    }
                } catch (RuntimeException exception) {
                    failedCount++;
                }
            }

            List<TaskGiteeBindingEntity> currentIterationBindings = taskGiteeBindingRepository.findAllByIteration_IdOrderByIdAsc(iterationId);
            for (TaskGiteeBindingEntity binding : currentIterationBindings) {
                if (seenIssueIds.contains(binding.getGiteeIssueId())) {
                    continue;
                }
                TaskEntity task = binding.getTask();
                if (task.getIteration() != null && task.getIteration().getId().equals(iterationId)) {
                    Map<String, TaskUpdateRecordService.FieldSnapshot> previousFields = taskUpdateRecordService == null ? null : taskUpdateRecordService.captureEditableFields(task);
                    task.setIteration(null);
                    TaskEntity savedTask = taskRepository.save(task);
                    if (taskUpdateRecordService != null) {
                        taskUpdateRecordService.recordChanges(savedTask, previousFields,
                                com.aiclub.platform.domain.model.TaskUpdateRecordSource.SYSTEM);
                    }
                }
                binding.setLastSyncStatus("REMOVED_FROM_ITERATION");
                binding.setLastSyncAt(now);
                taskGiteeBindingRepository.save(binding);
                removedCount++;
            }

            executionStatus = failedCount > 0 ? (createdCount > 0 || updatedCount > 0 || removedCount > 0 ? "PARTIAL" : "FAILED") : "SUCCESS";
            summaryMessage = buildSummaryMessage(createdCount, updatedCount, removedCount, failedCount);
        } catch (RuntimeException exception) {
            executionStatus = "FAILED";
            summaryMessage = limitMessage(exception.getMessage());
        }

        GiteeWorkItemSyncLogEntity logEntity = new GiteeWorkItemSyncLogEntity();
        logEntity.setProject(iteration.getProject());
        logEntity.setIteration(iteration);
        logEntity.setExecutedByUser(operator);
        logEntity.setEnterpriseId(enterpriseId);
        logEntity.setGiteeProgramId(projectBinding.getGiteeProgramId());
        logEntity.setGiteeMilestoneId(iterationBinding.getGiteeMilestoneId());
        logEntity.setExecutionStatus(executionStatus);
        logEntity.setTotalIssueCount(totalIssueCount);
        logEntity.setCreatedCount(createdCount);
        logEntity.setUpdatedCount(updatedCount);
        logEntity.setRemovedCount(removedCount);
        logEntity.setFailedCount(failedCount);
        logEntity.setSummaryMessage(summaryMessage);
        logEntity.setExecutedAt(now);
        giteeWorkItemSyncLogRepository.save(logEntity);

        knowledgeGraphService.rebuildProjectGraph(iteration.getProject().getId());
        return new GiteeWorkItemSyncResult(
                executionStatus,
                totalIssueCount,
                createdCount,
                updatedCount,
                removedCount,
                failedCount,
                summaryMessage,
                formatTime(now)
        );
    }

    public List<GiteeWorkItemSyncLogSummary> listIterationSyncLogs(Long iterationId) {
        requireIteration(iterationId);
        return giteeWorkItemSyncLogRepository.findTop20ByIteration_IdOrderByExecutedAtDescIdDesc(iterationId).stream()
                .map(item -> new GiteeWorkItemSyncLogSummary(
                        item.getId(),
                        item.getProject().getId(),
                        item.getIteration().getId(),
                        item.getExecutionStatus(),
                        item.getTotalIssueCount(),
                        item.getCreatedCount(),
                        item.getUpdatedCount(),
                        item.getRemovedCount(),
                        item.getFailedCount(),
                        item.getSummaryMessage(),
                        formatTime(item.getExecutedAt())
                ))
                .toList();
    }

    /**
     * Gitee 导入任务不走人工创建流程：
     * 不自动绑定本地负责人、不触发任务通知，也不触发需求 PRD 初始化。
     * 这里只保留最小工作项快照，确保同步行为可控且可重复执行。
     */
    private TaskEntity createTaskFromRemoteIssue(IterationEntity iteration,
                                                 GiteeApiService.GiteeIssue remoteIssue,
                                                 GiteeUserBindingIndex userBindingIndex) {
        TaskEntity entity = new TaskEntity();
        entity.setName(resolveTaskName(remoteIssue.title()));
        entity.setWorkItemCode(generateUniqueWorkItemCode());
        entity.setWorkItemType(resolveWorkItemType(remoteIssue.workItemType()));
        entity.setStatus(resolveStatus(remoteIssue.status()));
        entity.setPriority(resolvePriority(remoteIssue.priority()));
        applyRemoteUsers(entity, remoteIssue, userBindingIndex);
        entity.setCollaborators(new LinkedHashSet<>());
        entity.setProject(iteration.getProject());
        entity.setAgent(null);
        entity.setIteration(iteration);
        entity.setRequirementTask(null);
        applyRemoteContent(entity, remoteIssue);
        entity.setDevPassed(false);
        entity.setTestPassed(false);
        entity.setWorkHours(null);
        entity.setPlanStartDate(parseDate(remoteIssue.planStartDate()));
        entity.setPlanEndDate(parseDate(remoteIssue.planEndDate()));
        TaskEntity saved = taskRepository.save(entity);
        if (taskUpdateRecordService != null) {
            taskUpdateRecordService.recordCreate(saved, com.aiclub.platform.domain.model.TaskUpdateRecordSource.SYSTEM);
        }
        return saved;
    }

    private void updateTaskFromRemoteIssue(TaskEntity entity,
                                           IterationEntity iteration,
                                           GiteeApiService.GiteeIssue remoteIssue,
                                           GiteeUserBindingIndex userBindingIndex) {
        Map<String, TaskUpdateRecordService.FieldSnapshot> previousFields = taskUpdateRecordService == null ? null : taskUpdateRecordService.captureEditableFields(entity);
        String previousDescription = defaultString(entity.getDescription());
        String previousRequirementMarkdown = defaultString(entity.getRequirementMarkdown());
        entity.setName(resolveTaskName(remoteIssue.title()));
        entity.setWorkItemType(resolveWorkItemType(remoteIssue.workItemType()));
        entity.setStatus(resolveStatus(remoteIssue.status()));
        entity.setPriority(resolvePriority(remoteIssue.priority()));
        applyRemoteUsers(entity, remoteIssue, userBindingIndex);
        entity.setProject(iteration.getProject());
        entity.setIteration(iteration);
        applyRemoteContentForUpdate(entity, remoteIssue, previousDescription, previousRequirementMarkdown);
        entity.setPlanStartDate(parseDate(remoteIssue.planStartDate()));
        entity.setPlanEndDate(parseDate(remoteIssue.planEndDate()));
        TaskEntity saved = taskRepository.save(entity);
        if (taskUpdateRecordService != null) {
            taskUpdateRecordService.recordChanges(saved, previousFields,
                    com.aiclub.platform.domain.model.TaskUpdateRecordSource.SYSTEM);
        }
    }

    private void applyRemoteContent(TaskEntity entity, GiteeApiService.GiteeIssue remoteIssue) {
        String workItemType = resolveWorkItemType(remoteIssue.workItemType());
        String description = defaultString(remoteIssue.description());
        if ("需求".equals(workItemType)) {
            String requirementMarkdown = normalizeRemoteRequirementMarkdown(description);
            entity.setDescription(requirementMarkdown);
            entity.setRequirementMarkdown(requirementMarkdown);
            entity.setPrototypeUrl("");
            entity.setModuleName("未分类");
            return;
        }
        entity.setDescription(description);
        entity.setRequirementMarkdown("");
        entity.setPrototypeUrl("");
        entity.setModuleName("");
    }

    /**
     * Gitee 同步需要兼顾两类场景：
     * 1. 首次导入或从未维护过需求文档时，应让 requirementMarkdown 跟随远端描述回填，避免前端详情看起来像“空描述”。
     * 2. 本地已经人工维护过 requirementMarkdown 时，不应被同步粗暴覆盖。
     */
    private void applyRemoteContentForUpdate(TaskEntity entity,
                                             GiteeApiService.GiteeIssue remoteIssue,
                                             String previousDescription,
                                             String previousRequirementMarkdown) {
        String workItemType = resolveWorkItemType(remoteIssue.workItemType());
        String description = defaultString(remoteIssue.description());
        if ("需求".equals(workItemType)) {
            String requirementMarkdown = normalizeRemoteRequirementMarkdown(description);
            if (shouldBackfillRequirementMarkdown(previousDescription, previousRequirementMarkdown)) {
                entity.setDescription(requirementMarkdown);
                entity.setRequirementMarkdown(requirementMarkdown);
            } else {
                String preservedRequirementMarkdown = RequirementDocumentUtils.normalizeDocument(previousRequirementMarkdown);
                entity.setDescription(preservedRequirementMarkdown);
                entity.setRequirementMarkdown(preservedRequirementMarkdown);
            }
            return;
        }
        entity.setDescription(description);
        entity.setRequirementMarkdown("");
    }

    /**
     * Scrum Sprint 列表接口在部分企业实例里不会返回完整描述，
     * 这里只在正文缺失时按 issueId 补查一次详情，避免每次同步都无条件放大请求量。
     */
    private GiteeApiService.GiteeIssue enrichIssueWithDetailWhenDescriptionMissing(ProjectGiteeBindingEntity projectBinding,
                                                                                   String accessToken,
                                                                                   GiteeApiService.GiteeIssue remoteIssue) {
        if (hasText(remoteIssue.description())) {
            return remoteIssue;
        }
        try {
            GiteeApiService.GiteeIssue detailedIssue = giteeApiService.fetchIssueDetail(
                    resolveApiBaseUrl(projectBinding),
                    accessToken,
                    resolveEnterpriseId(projectBinding),
                    remoteIssue.id()
            );
            return hasText(detailedIssue.description()) ? mergeIssueDetail(remoteIssue, detailedIssue) : remoteIssue;
        } catch (RuntimeException ignored) {
            return remoteIssue;
        }
    }

    /**
     * 详情接口可能只返回正文等少数字段，这里用详情补齐正文，同时保留列表接口中的人员快照。
     */
    private GiteeApiService.GiteeIssue mergeIssueDetail(GiteeApiService.GiteeIssue listIssue,
                                                        GiteeApiService.GiteeIssue detailedIssue) {
        return new GiteeApiService.GiteeIssue(
                firstLongValue(detailedIssue.id(), listIssue.id()),
                firstTextValue(detailedIssue.title(), listIssue.title()),
                firstTextValue(detailedIssue.description(), listIssue.description()),
                firstTextValue(detailedIssue.workItemType(), listIssue.workItemType()),
                firstTextValue(detailedIssue.status(), listIssue.status()),
                firstTextValue(detailedIssue.priority(), listIssue.priority()),
                firstTextValue(detailedIssue.assigneeName(), listIssue.assigneeName()),
                firstLongValue(detailedIssue.assigneeMemberId(), listIssue.assigneeMemberId()),
                firstTextValue(detailedIssue.assigneeUsername(), listIssue.assigneeUsername()),
                firstLongValue(detailedIssue.creatorMemberId(), listIssue.creatorMemberId()),
                firstTextValue(detailedIssue.creatorUsername(), listIssue.creatorUsername()),
                firstTextValue(detailedIssue.creatorName(), listIssue.creatorName()),
                firstTextValue(detailedIssue.planStartDate(), listIssue.planStartDate()),
                firstTextValue(detailedIssue.planEndDate(), listIssue.planEndDate()),
                firstTextValue(detailedIssue.webUrl(), listIssue.webUrl())
        );
    }

    private boolean shouldBackfillRequirementMarkdown(String previousDescription, String previousRequirementMarkdown) {
        if (!hasText(previousRequirementMarkdown)) {
            return true;
        }
        return RequirementDocumentUtils.normalizeDocument(previousRequirementMarkdown)
                .equals(RequirementDocumentUtils.normalizeDocument(previousDescription));
    }

    /**
     * 需求类 Gitee 工作项需要先对齐到系统模板，再落到 description / requirementMarkdown。
     * 若远端正文本身不是 Gitee 四段模板，则保留原始 Markdown 规范化结果。
     */
    private String normalizeRemoteRequirementMarkdown(String description) {
        String normalized = RequirementDocumentUtils.normalizeDocument(description);
        if (RequirementDocumentUtils.matchesGiteeTemplateHeadings(normalized)) {
            return RequirementDocumentUtils.convertFromGiteeTemplate(normalized);
        }
        return normalized;
    }

    private IterationEntity requireIteration(Long iterationId) {
        IterationEntity iteration = iterationRepository.findById(iterationId)
                .orElseThrow(() -> new NoSuchElementException("迭代不存在: " + iterationId));
        projectDataPermissionService.requireIterationVisible(iteration);
        return iteration;
    }

    private IterationGiteeBindingEntity requireIterationBinding(Long iterationId) {
        return iterationGiteeBindingRepository.findByIteration_Id(iterationId)
                .orElseThrow(() -> new NoSuchElementException("当前迭代尚未绑定 Gitee 迭代"));
    }

    private ProjectGiteeBindingEntity requireProjectBinding(Long projectId) {
        return projectGiteeBindingRepository.findByProject_Id(projectId)
                .orElseThrow(() -> new NoSuchElementException("当前项目尚未绑定 Gitee 项目"));
    }

    /**
     * 项目级 Gitee 绑定已经切到全局企业配置优先，工作项同步也必须走同一套运行时取值规则。
     */
    private String resolveApiBaseUrl(ProjectGiteeBindingEntity projectBinding) {
        String resolved = platformEnvVarResolver.resolveOrDefault(
                PlatformEnvVarRegistry.KEY_GITEE_DEFAULT_API_URL,
                () -> projectBinding.getApiBaseUrl(),
                defaultApiUrl
        );
        if (!hasText(resolved)) {
            throw new IllegalStateException("当前项目的 Gitee 绑定缺少 API 地址配置");
        }
        while (resolved.endsWith("/")) {
            resolved = resolved.substring(0, resolved.length() - 1);
        }
        return giteeApiService.normalizeEnterpriseApiBaseUrl(resolved);
    }

    private Long resolveEnterpriseId(ProjectGiteeBindingEntity projectBinding) {
        try {
            String resolved = platformEnvVarResolver.resolve(
                    PlatformEnvVarRegistry.KEY_GITEE_BINDING_ENTERPRISE_ID,
                    () -> projectBinding.getEnterpriseId() == null ? null : String.valueOf(projectBinding.getEnterpriseId())
            ).value();
            return Long.parseLong(resolved);
        } catch (RuntimeException exception) {
            throw buildEnvVarException("Gitee 企业ID", exception);
        }
    }

    private String resolveAccessToken(ProjectGiteeBindingEntity projectBinding) {
        try {
            return platformEnvVarResolver.resolve(
                    PlatformEnvVarRegistry.KEY_GITEE_BINDING_ACCESS_TOKEN,
                    () -> hasText(projectBinding.getAccessTokenCiphertext())
                            ? tokenCipherService.decrypt(projectBinding.getAccessTokenCiphertext())
                            : null
            ).value();
        } catch (RuntimeException exception) {
            throw buildEnvVarException("Gitee Access Token", exception);
        }
    }

    private UserEntity currentUserOrNull() {
        Long userId = AuthContextHolder.get().map(authContext -> authContext.userId()).orElse(null);
        if (userId == null) {
            return null;
        }
        return userRepository.findById(userId).orElse(null);
    }

    /**
     * Gitee 导入人员只通过用户管理维护的远端成员绑定落到本地用户；
     * 远端自由文本不再作为负责人兜底，避免把未确认身份写成本地责任人。
     */
    private void applyRemoteUsers(TaskEntity entity,
                                  GiteeApiService.GiteeIssue remoteIssue,
                                  GiteeUserBindingIndex userBindingIndex) {
        UserEntity assigneeUser = resolveGiteeUser(userBindingIndex, remoteIssue.assigneeMemberId(), remoteIssue.assigneeUsername());
        UserEntity creatorUser = resolveGiteeUser(userBindingIndex, remoteIssue.creatorMemberId(), remoteIssue.creatorUsername());
        entity.setAssigneeUser(assigneeUser);
        entity.setAssignee(assigneeUser == null ? "" : displayName(assigneeUser));
        entity.setCreatorUser(creatorUser);
    }

    /**
     * 每轮同步只加载一次用户绑定，后续按 Gitee 成员ID优先、登录名兜底做内存匹配。
     */
    private GiteeUserBindingIndex buildGiteeUserBindingIndex() {
        Map<Long, UserEntity> byMemberId = new LinkedHashMap<>();
        Map<String, UserEntity> byUsername = new LinkedHashMap<>();
        List<UserEntity> users = userRepository.findAll();
        if (users == null) {
            users = List.of();
        }
        for (UserEntity user : users) {
            if (user == null) {
                continue;
            }
            if (user.getGiteeMemberId() != null) {
                byMemberId.putIfAbsent(user.getGiteeMemberId(), user);
            }
            String usernameKey = normalizeUsernameKey(user.getGiteeUsername());
            if (usernameKey != null) {
                byUsername.putIfAbsent(usernameKey, user);
            }
        }
        return new GiteeUserBindingIndex(byMemberId, byUsername);
    }

    private UserEntity resolveGiteeUser(GiteeUserBindingIndex userBindingIndex, Long memberId, String username) {
        if (memberId != null) {
            UserEntity matchedUser = userBindingIndex.byMemberId().get(memberId);
            if (matchedUser != null) {
                return matchedUser;
            }
        }
        String usernameKey = normalizeUsernameKey(username);
        return usernameKey == null ? null : userBindingIndex.byUsername().get(usernameKey);
    }

    private String resolveTaskName(String value) {
        String normalized = trimToNull(value);
        return normalized == null ? "未命名工作项" : normalized;
    }

    /**
     * Gitee 侧可能存在“开发任务”“运维任务”等细分类；
     * 本地当前只支持需求、任务、缺陷三类，因此这里统一折算后再落库。
     */
    private String resolveWorkItemType(String value) {
        String normalized = trimToNull(value);
        if (normalized == null) {
            return "任务";
        }
        if ("需求".equals(normalized) || normalized.contains("需求")) {
            return "需求";
        }
        if ("缺陷".equals(normalized) || normalized.contains("缺陷") || normalized.toUpperCase(Locale.ROOT).contains("BUG")) {
            return "缺陷";
        }
        return "任务";
    }

    private String resolveStatus(String value) {
        String normalized = trimToNull(value);
        return normalized == null ? "草稿" : normalized;
    }

    private String resolvePriority(String value) {
        String normalized = trimToNull(value);
        if (normalized == null) {
            return "中";
        }
        if (NORMAL_PRIORITIES.contains(normalized)) {
            return normalized;
        }
        String mappedPriority = GITEE_PRIORITY_MAPPING.get(normalized.toUpperCase(Locale.ROOT));
        if (mappedPriority != null) {
            return mappedPriority;
        }
        return normalized;
    }

    private LocalDate parseDate(String value) {
        String normalized = trimToNull(value);
        if (normalized == null) {
            return null;
        }
        try {
            return LocalDate.parse(normalized);
        } catch (DateTimeParseException ignored) {
            return null;
        }
    }

    private String buildSummaryMessage(int createdCount, int updatedCount, int removedCount, int failedCount) {
        return "同步完成：新增 " + createdCount
                + "，更新 " + updatedCount
                + "，移出迭代 " + removedCount
                + "，失败 " + failedCount;
    }

    private String generateUniqueWorkItemCode() {
        for (int attempt = 0; attempt < 200; attempt++) {
            String nextCode = buildRandomWorkItemCode();
            if (!taskRepository.existsByWorkItemCode(nextCode)) {
                return nextCode;
            }
        }
        throw new IllegalStateException("工作项编号生成失败，请稍后重试");
    }

    private String buildRandomWorkItemCode() {
        StringBuilder builder = new StringBuilder(WORK_ITEM_CODE_PREFIX);
        for (int index = 0; index < WORK_ITEM_CODE_RANDOM_LENGTH; index++) {
            int randomIndex = workItemCodeRandom.nextInt(WORK_ITEM_CODE_CHARS.length());
            builder.append(WORK_ITEM_CODE_CHARS.charAt(randomIndex));
        }
        return builder.toString();
    }

    private String formatTime(LocalDateTime value) {
        return value == null ? null : value.format(TIME_FORMATTER);
    }

    private String limitMessage(String value) {
        if (!hasText(value)) {
            return "同步失败";
        }
        String normalized = value.trim();
        return normalized.length() > 1000 ? normalized.substring(0, 1000) : normalized;
    }

    private String defaultString(String value) {
        return value == null ? "" : value.trim();
    }

    private String firstTextValue(String primary, String fallback) {
        String normalizedPrimary = trimToNull(primary);
        return normalizedPrimary == null ? defaultString(fallback) : normalizedPrimary;
    }

    private Long firstLongValue(Long primary, Long fallback) {
        return primary == null ? fallback : primary;
    }

    private String displayName(UserEntity user) {
        String nickname = defaultString(user.getNickname());
        return nickname.isBlank() ? defaultString(user.getUsername()) : nickname;
    }

    private String normalizeUsernameKey(String value) {
        String normalized = trimToNull(value);
        return normalized == null ? null : normalized.toLowerCase(Locale.ROOT);
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

    private IllegalStateException buildEnvVarException(String label, RuntimeException exception) {
        String message = hasText(exception.getMessage()) ? exception.getMessage().trim() : label + "配置异常";
        if (message.contains("未配置")) {
            return new IllegalStateException("请先在系统设置-环境变量管理中配置 " + label, exception);
        }
        return new IllegalStateException("系统设置-环境变量管理中的" + label + "配置无效：" + message, exception);
    }

    private record GiteeUserBindingIndex(Map<Long, UserEntity> byMemberId,
                                         Map<String, UserEntity> byUsername) {
    }
}
