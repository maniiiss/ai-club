package com.aiclub.platform.service;

import com.aiclub.platform.common.DataPermissionScopeType;
import com.aiclub.platform.domain.model.ExecutionArtifactEntity;
import com.aiclub.platform.domain.model.ExecutionRunEntity;
import com.aiclub.platform.domain.model.ExecutionStepEntity;
import com.aiclub.platform.domain.model.ExecutionTaskEntity;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.TaskEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.ExecutionArtifactSummary;
import com.aiclub.platform.dto.ExecutionRunDetail;
import com.aiclub.platform.dto.ExecutionRunSummary;
import com.aiclub.platform.dto.ExecutionStepSummary;
import com.aiclub.platform.dto.ExecutionTaskDetail;
import com.aiclub.platform.dto.ExecutionTaskSummary;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.TaskAgentRunSummary;
import com.aiclub.platform.dto.request.CreateExecutionTaskRequest;
import com.aiclub.platform.dto.request.ExecutionAgentBindingRequest;
import com.aiclub.platform.exception.UnauthorizedException;
import com.aiclub.platform.repository.ExecutionArtifactRepository;
import com.aiclub.platform.repository.ExecutionRunRepository;
import com.aiclub.platform.repository.ExecutionStepRepository;
import com.aiclub.platform.repository.ExecutionTaskRepository;
import com.aiclub.platform.repository.ProjectRepository;
import com.aiclub.platform.repository.TaskRepository;
import com.aiclub.platform.repository.UserRepository;
import com.aiclub.platform.security.AuthContextHolder;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.criteria.From;
import jakarta.persistence.criteria.JoinType;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

/**
 * 执行中心任务服务。
 * 负责执行任务的创建、查询、取消、重试，以及旧任务 Agent 运行接口的兼容适配。
 */
@Service
@Transactional(readOnly = true)
public class ExecutionTaskService {

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final ExecutionTaskRepository executionTaskRepository;
    private final ExecutionRunRepository executionRunRepository;
    private final ExecutionStepRepository executionStepRepository;
    private final ExecutionArtifactRepository executionArtifactRepository;
    private final ProjectRepository projectRepository;
    private final TaskRepository taskRepository;
    private final UserRepository userRepository;
    private final ProjectDataPermissionService projectDataPermissionService;
    private final ExecutionWorkflowService executionWorkflowService;
    private final ExecutionDispatchService executionDispatchService;
    private final ObjectMapper objectMapper;

    public ExecutionTaskService(ExecutionTaskRepository executionTaskRepository,
                                ExecutionRunRepository executionRunRepository,
                                ExecutionStepRepository executionStepRepository,
                                ExecutionArtifactRepository executionArtifactRepository,
                                ProjectRepository projectRepository,
                                TaskRepository taskRepository,
                                UserRepository userRepository,
                                ProjectDataPermissionService projectDataPermissionService,
                                ExecutionWorkflowService executionWorkflowService,
                                ExecutionDispatchService executionDispatchService,
                                ObjectMapper objectMapper) {
        this.executionTaskRepository = executionTaskRepository;
        this.executionRunRepository = executionRunRepository;
        this.executionStepRepository = executionStepRepository;
        this.executionArtifactRepository = executionArtifactRepository;
        this.projectRepository = projectRepository;
        this.taskRepository = taskRepository;
        this.userRepository = userRepository;
        this.projectDataPermissionService = projectDataPermissionService;
        this.executionWorkflowService = executionWorkflowService;
        this.executionDispatchService = executionDispatchService;
        this.objectMapper = objectMapper;
    }

    public PageResponse<ExecutionTaskSummary> pageExecutionTasks(int page,
                                                                 int size,
                                                                 String keyword,
                                                                 String status,
                                                                 String scenarioCode,
                                                                 Long projectId) {
        ProjectDataPermissionService.ProjectDataScope scope = projectDataPermissionService.requireCurrentScope();
        if (projectId != null) {
            requireProject(projectId);
        }
        Pageable pageable = PageRequest.of(Math.max(page - 1, 0), Math.max(1, Math.min(size, 100)), Sort.by(Sort.Direction.DESC, "createdAt", "id"));
        Page<ExecutionTaskSummary> pageData = executionTaskRepository.findAll(
                        executionTaskSpecification(keyword, status, scenarioCode, projectId, scope),
                        pageable
                )
                .map(this::toTaskSummary);
        return PageResponse.from(pageData);
    }

    public ExecutionTaskDetail getExecutionTask(Long executionTaskId) {
        return toTaskDetail(requireExecutionTask(executionTaskId));
    }

    public List<ExecutionRunSummary> listExecutionRuns(Long executionTaskId) {
        requireExecutionTask(executionTaskId);
        return executionRunRepository.findAllByExecutionTask_IdOrderByRunNoDescIdDesc(executionTaskId).stream()
                .map(this::toRunSummary)
                .toList();
    }

    public ExecutionRunDetail getExecutionRun(Long executionRunId) {
        return toRunDetail(requireExecutionRun(executionRunId));
    }

    /**
     * 创建新的执行中心任务，并将步骤 Agent 绑定在创建时一次性固化。
     */
    @Transactional
    public ExecutionTaskSummary createExecutionTask(CreateExecutionTaskRequest request) {
        ProjectEntity project = requireProject(request.projectId());
        TaskEntity workItem = request.workItemId() == null ? null : requireWorkItem(project.getId(), request.workItemId());
        UserEntity currentUser = requireCurrentUser();
        ExecutionWorkflowService.WorkflowPlan workflowPlan = executionWorkflowService.buildWorkflow(
                request.scenarioCode(),
                project.getId(),
                request.agentBindings()
        );

        ExecutionTaskEntity entity = new ExecutionTaskEntity();
        entity.setSourceType(workItem == null ? "MANUAL" : "WORK_ITEM");
        entity.setSourceId(workItem == null ? null : workItem.getId());
        entity.setTriggerSource(normalizeTriggerSource(request.triggerSource()));
        entity.setScenarioCode(workflowPlan.scenarioCode());
        entity.setTitle(resolveExecutionTaskTitle(request.title(), workflowPlan.scenarioName(), workItem));
        entity.setProject(project);
        entity.setWorkItem(workItem);
        entity.setCreatedByUser(currentUser);
        entity.setStatus("PENDING");
        entity.setCancelRequested(false);
        entity.setLatestSummary("等待调度");
        entity.setInputPayload(serializePayload(defaultPayload(request.inputPayload())));
        entity.setAgentBindingPayload(executionWorkflowService.serializeBindings(workflowPlan));
        return toTaskSummary(executionTaskRepository.save(entity));
    }

    /**
     * 取消执行任务。
     * 待执行任务会直接取消；执行中任务会在步骤边界停止。
     */
    @Transactional
    public ExecutionTaskSummary cancelExecutionTask(Long executionTaskId) {
        ExecutionTaskEntity executionTask = requireExecutionTask(executionTaskId);
        if ("PENDING".equals(executionTask.getStatus())) {
            executionTask.setStatus("CANCELED");
            executionTask.setCancelRequested(false);
            executionTask.setLatestSummary("执行已取消");
            return toTaskSummary(executionTaskRepository.save(executionTask));
        }
        if ("RUNNING".equals(executionTask.getStatus())) {
            executionTask.setCancelRequested(true);
            executionTask.setLatestSummary("已请求取消，当前步骤结束后停止");
            return toTaskSummary(executionTaskRepository.save(executionTask));
        }
        return toTaskSummary(executionTask);
    }

    /**
     * 重试执行任务。
     * 第一版沿用同一执行任务主键，重新排队并生成新的运行实例。
     */
    @Transactional
    public ExecutionTaskSummary retryExecutionTask(Long executionTaskId) {
        ExecutionTaskEntity executionTask = requireExecutionTask(executionTaskId);
        if ("RUNNING".equals(executionTask.getStatus()) || "PENDING".equals(executionTask.getStatus())) {
            throw new IllegalArgumentException("当前执行任务仍在处理中，暂不可重试");
        }
        executionTask.setStatus("PENDING");
        executionTask.setCancelRequested(false);
        executionTask.setLatestSummary("已重新排队");
        return toTaskSummary(executionTaskRepository.save(executionTask));
    }

    /**
     * 兼容旧任务 Agent 运行入口：创建执行任务并立即执行。
     */
    @Transactional
    public TaskAgentRunSummary createLegacyExecutionTask(Long workItemId, String inputText) {
        TaskEntity workItem = requireWorkItemVisible(workItemId);
        if (workItem.getAgent() == null) {
            throw new IllegalArgumentException("当前任务未绑定执行 Agent");
        }

        CreateExecutionTaskRequest request = new CreateExecutionTaskRequest(
                ExecutionWorkflowService.SCENARIO_AD_HOC_AGENT_RUN,
                workItem.getProject().getId(),
                workItem.getId(),
                workItem.getName() + " - 单次执行",
                "LEGACY_TASK_AGENT_RUN",
                List.of(new ExecutionAgentBindingRequest(ExecutionWorkflowService.STEP_AD_HOC_RUN, workItem.getAgent().getId())),
                Map.of("inputText", defaultString(inputText).trim())
        );
        ExecutionTaskSummary executionTaskSummary = createExecutionTask(request);
        ExecutionRunEntity executionRun = executionDispatchService.dispatchTaskNow(executionTaskSummary.id());
        return toLegacyRunSummary(executionRun);
    }

    public List<TaskAgentRunSummary> listRecentWorkItemRuns(Long workItemId) {
        requireWorkItemVisible(workItemId);
        return executionRunRepository.findTop10ByExecutionTask_WorkItem_IdOrderByCreatedAtDescIdDesc(workItemId).stream()
                .map(this::toLegacyRunSummary)
                .toList();
    }

    private Specification<ExecutionTaskEntity> executionTaskSpecification(String keyword,
                                                                          String status,
                                                                          String scenarioCode,
                                                                          Long projectId,
                                                                          ProjectDataPermissionService.ProjectDataScope scope) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            appendProjectVisibilityPredicate(predicates, root.join("project", JoinType.INNER), query, cb, scope);
            if (hasText(keyword)) {
                String pattern = "%" + keyword.trim().toLowerCase() + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("title")), pattern),
                        cb.like(cb.lower(root.get("latestSummary")), pattern),
                        cb.like(cb.lower(root.join("project", JoinType.LEFT).get("name")), pattern),
                        cb.like(cb.lower(root.join("workItem", JoinType.LEFT).get("name")), pattern)
                ));
            }
            if (hasText(status)) {
                predicates.add(cb.equal(root.get("status"), status.trim()));
            }
            if (hasText(scenarioCode)) {
                predicates.add(cb.equal(root.get("scenarioCode"), scenarioCode.trim().toUpperCase()));
            }
            if (projectId != null) {
                predicates.add(cb.equal(root.get("project").get("id"), projectId));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    /**
     * 沿用当前系统项目可见性策略，确保执行中心只暴露当前用户可访问的项目数据。
     */
    private void appendProjectVisibilityPredicate(List<Predicate> predicates,
                                                  From<?, ProjectEntity> projectRoot,
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

    private ExecutionTaskSummary toTaskSummary(ExecutionTaskEntity executionTask) {
        ExecutionRunEntity currentRun = executionTask.getCurrentRun();
        String currentStepName = currentRun == null ? null : resolveStepName(currentRun, currentRun.getCurrentStepNo());
        return new ExecutionTaskSummary(
                executionTask.getId(),
                executionTask.getTitle(),
                executionTask.getScenarioCode(),
                executionWorkflowService.scenarioName(executionTask.getScenarioCode()),
                executionTask.getSourceType(),
                executionTask.getSourceId(),
                executionTask.getProject().getId(),
                executionTask.getProject().getName(),
                executionTask.getWorkItem() == null ? null : executionTask.getWorkItem().getId(),
                executionTask.getWorkItem() == null ? null : executionTask.getWorkItem().getWorkItemCode(),
                executionTask.getWorkItem() == null ? null : executionTask.getWorkItem().getName(),
                executionTask.getStatus(),
                currentRun == null ? null : currentRun.getId(),
                currentRun == null ? null : currentRun.getStatus(),
                currentRun == null ? 0 : currentRun.getProgressPercent(),
                currentRun == null ? null : currentRun.getCurrentStepNo(),
                currentStepName,
                executionTask.getLatestSummary(),
                executionTask.getCreatedByUser() == null ? null : executionTask.getCreatedByUser().getId(),
                displayName(executionTask.getCreatedByUser()),
                formatTime(executionTask.getCreatedAt()),
                formatTime(executionTask.getUpdatedAt())
        );
    }

    private ExecutionTaskDetail toTaskDetail(ExecutionTaskEntity executionTask) {
        List<ExecutionRunSummary> runs = executionRunRepository.findAllByExecutionTask_IdOrderByRunNoDescIdDesc(executionTask.getId()).stream()
                .map(this::toRunSummary)
                .toList();
        return new ExecutionTaskDetail(
                executionTask.getId(),
                executionTask.getTitle(),
                executionTask.getScenarioCode(),
                executionWorkflowService.scenarioName(executionTask.getScenarioCode()),
                executionTask.getSourceType(),
                executionTask.getSourceId(),
                executionTask.getTriggerSource(),
                executionTask.getProject().getId(),
                executionTask.getProject().getName(),
                executionTask.getWorkItem() == null ? null : executionTask.getWorkItem().getId(),
                executionTask.getWorkItem() == null ? null : executionTask.getWorkItem().getWorkItemCode(),
                executionTask.getWorkItem() == null ? null : executionTask.getWorkItem().getName(),
                executionTask.getStatus(),
                executionTask.isCancelRequested(),
                executionTask.getLatestSummary(),
                executionTask.getCreatedByUser() == null ? null : executionTask.getCreatedByUser().getId(),
                displayName(executionTask.getCreatedByUser()),
                formatTime(executionTask.getCreatedAt()),
                formatTime(executionTask.getUpdatedAt()),
                executionTask.getCurrentRun() == null ? null : executionTask.getCurrentRun().getId(),
                executionTask.getInputPayload(),
                runs
        );
    }

    private ExecutionRunSummary toRunSummary(ExecutionRunEntity executionRun) {
        return new ExecutionRunSummary(
                executionRun.getId(),
                executionRun.getExecutionTask().getId(),
                executionRun.getRunNo(),
                executionRun.getStatus(),
                executionRun.getProgressPercent(),
                executionRun.getCurrentStepNo(),
                resolveStepName(executionRun, executionRun.getCurrentStepNo()),
                executionRun.getInputSnapshot(),
                executionRun.getOutputSummary(),
                executionRun.getErrorMessage(),
                formatTime(executionRun.getStartedAt()),
                formatTime(executionRun.getFinishedAt()),
                formatTime(executionRun.getCreatedAt())
        );
    }

    private ExecutionRunDetail toRunDetail(ExecutionRunEntity executionRun) {
        List<ExecutionStepSummary> steps = executionStepRepository.findAllByRun_IdOrderByStepNoAscIdAsc(executionRun.getId()).stream()
                .map(this::toStepSummary)
                .toList();
        List<ExecutionArtifactSummary> artifacts = executionArtifactRepository.findAllByRun_IdOrderByCreatedAtAscIdAsc(executionRun.getId()).stream()
                .map(this::toArtifactSummary)
                .toList();
        return new ExecutionRunDetail(
                executionRun.getId(),
                executionRun.getExecutionTask().getId(),
                executionRun.getRunNo(),
                executionRun.getStatus(),
                executionRun.getProgressPercent(),
                executionRun.getCurrentStepNo(),
                resolveStepName(executionRun, executionRun.getCurrentStepNo()),
                executionRun.getInputSnapshot(),
                executionRun.getOutputSummary(),
                executionRun.getErrorMessage(),
                formatTime(executionRun.getStartedAt()),
                formatTime(executionRun.getFinishedAt()),
                formatTime(executionRun.getCreatedAt()),
                steps,
                artifacts
        );
    }

    private ExecutionStepSummary toStepSummary(ExecutionStepEntity executionStep) {
        return new ExecutionStepSummary(
                executionStep.getId(),
                executionStep.getRun().getId(),
                executionStep.getStepNo(),
                executionStep.getStepCode(),
                executionStep.getStepName(),
                executionStep.getAgent() == null ? null : executionStep.getAgent().getId(),
                executionStep.getAgent() == null ? null : executionStep.getAgent().getName(),
                executionStep.getStatus(),
                executionStep.getProgressPercent(),
                executionStep.getLatestMessage(),
                executionStep.getInputSnapshot(),
                executionStep.getOutputSnapshot(),
                executionStep.getErrorMessage(),
                formatTime(executionStep.getStartedAt()),
                formatTime(executionStep.getFinishedAt())
        );
    }

    private ExecutionArtifactSummary toArtifactSummary(ExecutionArtifactEntity executionArtifact) {
        return new ExecutionArtifactSummary(
                executionArtifact.getId(),
                executionArtifact.getRun().getId(),
                executionArtifact.getStep() == null ? null : executionArtifact.getStep().getId(),
                executionArtifact.getArtifactType(),
                executionArtifact.getTitle(),
                buildArtifactDownloadUrl(executionArtifact),
                executionArtifact.getContentText(),
                executionArtifact.isWorkItemWritebackFlag()
        );
    }

    private TaskAgentRunSummary toLegacyRunSummary(ExecutionRunEntity executionRun) {
        List<ExecutionStepEntity> steps = executionStepRepository.findAllByRun_IdOrderByStepNoAscIdAsc(executionRun.getId());
        ExecutionStepEntity firstStep = steps.isEmpty() ? null : steps.get(0);
        TaskEntity workItem = executionRun.getExecutionTask().getWorkItem();
        return new TaskAgentRunSummary(
                executionRun.getId(),
                workItem == null ? null : workItem.getId(),
                workItem == null ? executionRun.getExecutionTask().getTitle() : workItem.getName(),
                firstStep == null || firstStep.getAgent() == null ? null : firstStep.getAgent().getId(),
                firstStep == null || firstStep.getAgent() == null ? null : firstStep.getAgent().getName(),
                executionRun.getStatus(),
                firstStep == null ? executionRun.getInputSnapshot() : firstStep.getInputSnapshot(),
                executionRun.getOutputSummary(),
                executionRun.getErrorMessage(),
                executionRun.getExecutionTask().getCreatedByUser() == null ? null : executionRun.getExecutionTask().getCreatedByUser().getId(),
                displayName(executionRun.getExecutionTask().getCreatedByUser()),
                formatTime(executionRun.getCreatedAt())
        );
    }

    private String resolveStepName(ExecutionRunEntity executionRun, Integer stepNo) {
        if (executionRun == null || stepNo == null) {
            return null;
        }
        return executionStepRepository.findAllByRun_IdOrderByStepNoAscIdAsc(executionRun.getId()).stream()
                .filter(step -> stepNo.equals(step.getStepNo()))
                .map(ExecutionStepEntity::getStepName)
                .findFirst()
                .orElse(null);
    }

    private ProjectEntity requireProject(Long projectId) {
        ProjectEntity project = projectRepository.findById(projectId)
                .orElseThrow(() -> new NoSuchElementException("项目不存在: " + projectId));
        projectDataPermissionService.requireProjectVisible(project);
        return project;
    }

    private TaskEntity requireWorkItem(Long projectId, Long workItemId) {
        TaskEntity workItem = requireWorkItemVisible(workItemId);
        if (!workItem.getProject().getId().equals(projectId)) {
            throw new IllegalArgumentException("工作项必须属于当前项目");
        }
        return workItem;
    }

    private TaskEntity requireWorkItemVisible(Long workItemId) {
        TaskEntity workItem = taskRepository.findById(workItemId)
                .orElseThrow(() -> new NoSuchElementException("工作项不存在: " + workItemId));
        projectDataPermissionService.requireTaskVisible(workItem);
        return workItem;
    }

    private ExecutionTaskEntity requireExecutionTask(Long executionTaskId) {
        ExecutionTaskEntity executionTask = executionTaskRepository.findById(executionTaskId)
                .orElseThrow(() -> new NoSuchElementException("执行任务不存在: " + executionTaskId));
        projectDataPermissionService.requireProjectVisible(executionTask.getProject());
        return executionTask;
    }

    private ExecutionRunEntity requireExecutionRun(Long executionRunId) {
        ExecutionRunEntity executionRun = executionRunRepository.findById(executionRunId)
                .orElseThrow(() -> new NoSuchElementException("执行运行不存在: " + executionRunId));
        projectDataPermissionService.requireProjectVisible(executionRun.getExecutionTask().getProject());
        return executionRun;
    }

    private UserEntity requireCurrentUser() {
        Long userId = AuthContextHolder.get()
                .map(authContext -> authContext.userId())
                .orElseThrow(() -> new UnauthorizedException("Not logged in"));
        return userRepository.findById(userId)
                .orElseThrow(() -> new NoSuchElementException("用户不存在: " + userId));
    }

    private Map<String, Object> defaultPayload(Map<String, Object> inputPayload) {
        return inputPayload == null ? new LinkedHashMap<>() : new LinkedHashMap<>(inputPayload);
    }

    private String serializePayload(Map<String, Object> payload) {
        try {
            return objectMapper.writeValueAsString(payload);
        } catch (Exception exception) {
            throw new IllegalStateException("执行任务输入载荷序列化失败", exception);
        }
    }

    private String resolveExecutionTaskTitle(String requestedTitle, String scenarioName, TaskEntity workItem) {
        if (hasText(requestedTitle)) {
            return requestedTitle.trim();
        }
        if (workItem == null) {
            return scenarioName;
        }
        return workItem.getName() + " - " + scenarioName;
    }

    private String normalizeTriggerSource(String triggerSource) {
        if (!hasText(triggerSource)) {
            return "PAGE";
        }
        return triggerSource.trim().toUpperCase();
    }

    private String displayName(UserEntity user) {
        if (user == null) {
            return null;
        }
        String nickname = defaultString(user.getNickname()).trim();
        return nickname.isBlank() ? user.getUsername() : nickname;
    }

    /**
     * 执行产物对前端统一暴露鉴权下载地址，避免直接泄露对象存储内部对象键。
     */
    private String buildArtifactDownloadUrl(ExecutionArtifactEntity executionArtifact) {
        if (executionArtifact == null || !hasText(executionArtifact.getContentRef())) {
            return null;
        }
        return "/api/execution-artifacts/" + executionArtifact.getId() + "/download";
    }

    private String formatTime(LocalDateTime time) {
        return time == null ? null : time.format(TIME_FORMATTER);
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private String defaultString(String value) {
        return value == null ? "" : value;
    }
}
