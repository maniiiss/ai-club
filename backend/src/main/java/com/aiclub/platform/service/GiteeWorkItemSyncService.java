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
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Set;

/**
 * 按迭代绑定的 Gitee milestone 手动拉取 issue，并同步到本地工作项。
 * 第一版只做单向导入，不回写评论、附件或测试结果。
 */
@Service
@Transactional(readOnly = true)
public class GiteeWorkItemSyncService {

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final String WORK_ITEM_CODE_PREFIX = "#";
    private static final String WORK_ITEM_CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    private static final int WORK_ITEM_CODE_RANDOM_LENGTH = 6;
    private static final Set<String> NORMAL_PRIORITIES = Set.of("高", "中", "低");

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
    private final SecureRandom workItemCodeRandom = new SecureRandom();

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
                                    KnowledgeGraphService knowledgeGraphService) {
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

        try {
            String accessToken = tokenCipherService.decrypt(projectBinding.getAccessTokenCiphertext());
            List<GiteeApiService.GiteeIssue> remoteIssues = giteeApiService.listIssues(
                    projectBinding.getApiBaseUrl(),
                    accessToken,
                    projectBinding.getEnterpriseId(),
                    projectBinding.getGiteeProgramId(),
                    iterationBinding.getGiteeMilestoneId()
            );
            totalIssueCount = remoteIssues.size();

            Map<Long, TaskGiteeBindingEntity> existingBindingsByIssueId = new LinkedHashMap<>();
            List<Long> remoteIssueIds = remoteIssues.stream().map(GiteeApiService.GiteeIssue::id).toList();
            if (!remoteIssueIds.isEmpty()) {
                taskGiteeBindingRepository.findAllByEnterpriseIdAndGiteeIssueIdIn(projectBinding.getEnterpriseId(), remoteIssueIds)
                        .forEach(item -> existingBindingsByIssueId.put(item.getGiteeIssueId(), item));
            }

            Set<Long> seenIssueIds = new LinkedHashSet<>();
            for (GiteeApiService.GiteeIssue remoteIssue : remoteIssues) {
                seenIssueIds.add(remoteIssue.id());
                try {
                    TaskGiteeBindingEntity existingBinding = existingBindingsByIssueId.get(remoteIssue.id());
                    if (existingBinding == null) {
                        TaskEntity createdTask = createTaskFromRemoteIssue(iteration, remoteIssue, operator);
                        TaskGiteeBindingEntity binding = new TaskGiteeBindingEntity();
                        binding.setTask(createdTask);
                        binding.setProject(iteration.getProject());
                        binding.setIteration(iteration);
                        binding.setEnterpriseId(projectBinding.getEnterpriseId());
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
                        updateTaskFromRemoteIssue(existingBinding.getTask(), iteration, remoteIssue);
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
                    task.setIteration(null);
                    taskRepository.save(task);
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
        logEntity.setEnterpriseId(projectBinding.getEnterpriseId());
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
                                                 UserEntity operator) {
        TaskEntity entity = new TaskEntity();
        entity.setName(resolveTaskName(remoteIssue.title()));
        entity.setWorkItemCode(generateUniqueWorkItemCode());
        entity.setWorkItemType(resolveWorkItemType(remoteIssue.workItemType()));
        entity.setStatus(resolveStatus(remoteIssue.status()));
        entity.setPriority(resolvePriority(remoteIssue.priority()));
        entity.setAssignee(resolveAssignee(remoteIssue.assigneeName()));
        entity.setAssigneeUser(null);
        entity.setCollaborators(new LinkedHashSet<>());
        entity.setProject(iteration.getProject());
        entity.setCreatorUser(operator);
        entity.setAgent(null);
        entity.setIteration(iteration);
        entity.setRequirementTask(null);
        applyRemoteContent(entity, remoteIssue);
        entity.setDevPassed(false);
        entity.setTestPassed(false);
        entity.setWorkHours(null);
        entity.setPlanStartDate(parseDate(remoteIssue.planStartDate()));
        entity.setPlanEndDate(parseDate(remoteIssue.planEndDate()));
        return taskRepository.save(entity);
    }

    private void updateTaskFromRemoteIssue(TaskEntity entity, IterationEntity iteration, GiteeApiService.GiteeIssue remoteIssue) {
        entity.setName(resolveTaskName(remoteIssue.title()));
        entity.setWorkItemType(resolveWorkItemType(remoteIssue.workItemType()));
        entity.setStatus(resolveStatus(remoteIssue.status()));
        entity.setPriority(resolvePriority(remoteIssue.priority()));
        entity.setAssignee(resolveAssignee(remoteIssue.assigneeName()));
        entity.setAssigneeUser(null);
        entity.setProject(iteration.getProject());
        entity.setIteration(iteration);
        entity.setDescription(defaultString(remoteIssue.description()));
        entity.setPlanStartDate(parseDate(remoteIssue.planStartDate()));
        entity.setPlanEndDate(parseDate(remoteIssue.planEndDate()));
        taskRepository.save(entity);
    }

    private void applyRemoteContent(TaskEntity entity, GiteeApiService.GiteeIssue remoteIssue) {
        String workItemType = resolveWorkItemType(remoteIssue.workItemType());
        String description = defaultString(remoteIssue.description());
        if ("需求".equals(workItemType)) {
            String requirementMarkdown = RequirementDocumentUtils.normalizeDocument(description);
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

    private IterationEntity requireIteration(Long iterationId) {
        IterationEntity iteration = iterationRepository.findById(iterationId)
                .orElseThrow(() -> new NoSuchElementException("迭代不存在: " + iterationId));
        projectDataPermissionService.requireIterationVisible(iteration);
        return iteration;
    }

    private IterationGiteeBindingEntity requireIterationBinding(Long iterationId) {
        return iterationGiteeBindingRepository.findByIteration_Id(iterationId)
                .orElseThrow(() -> new NoSuchElementException("当前迭代尚未绑定 Gitee 里程碑"));
    }

    private ProjectGiteeBindingEntity requireProjectBinding(Long projectId) {
        return projectGiteeBindingRepository.findByProject_Id(projectId)
                .orElseThrow(() -> new NoSuchElementException("当前项目尚未绑定 Gitee 项目"));
    }

    private UserEntity currentUserOrNull() {
        Long userId = AuthContextHolder.get().map(authContext -> authContext.userId()).orElse(null);
        if (userId == null) {
            return null;
        }
        return userRepository.findById(userId).orElse(null);
    }

    private String resolveTaskName(String value) {
        String normalized = trimToNull(value);
        return normalized == null ? "未命名工作项" : normalized;
    }

    private String resolveWorkItemType(String value) {
        String normalized = trimToNull(value);
        return normalized == null ? "任务" : normalized;
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
        return normalized;
    }

    private String resolveAssignee(String value) {
        String normalized = trimToNull(value);
        return normalized == null ? "未分配" : normalized;
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
}
