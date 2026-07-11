package com.aiclub.platform.service;

import com.aiclub.platform.common.DataPermissionScopeType;
import com.aiclub.platform.domain.model.ExecutionArtifactEntity;
import com.aiclub.platform.domain.model.ExecutionRunEntity;
import com.aiclub.platform.domain.model.ExecutionStepEntity;
import com.aiclub.platform.domain.model.ExecutionTaskEntity;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.ProjectGitlabBindingEntity;
import com.aiclub.platform.domain.model.TaskEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.ExecutionArtifactSummary;
import com.aiclub.platform.dto.ExecutionTaskListStatsSummary;
import com.aiclub.platform.dto.ExecutionRunDetail;
import com.aiclub.platform.dto.ExecutionResolvedBindingSummary;
import com.aiclub.platform.dto.ExecutionRunSummary;
import com.aiclub.platform.dto.ExecutionStepSummary;
import com.aiclub.platform.dto.ExecutionTaskDetail;
import com.aiclub.platform.dto.ExecutionTaskSummary;
import com.aiclub.platform.dto.ExecutionWorkspaceCleanupSummary;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.TaskAgentRunSummary;
import com.aiclub.platform.dto.request.ConfirmExecutionPlanRequest;
import com.aiclub.platform.dto.request.CreateExecutionTaskRequest;
import com.aiclub.platform.dto.request.ExecutionAgentBindingRequest;
import com.aiclub.platform.dto.request.UpdateExecutionPlanMarkdownRequest;
import com.aiclub.platform.exception.ForbiddenException;
import com.aiclub.platform.exception.UnauthorizedException;
import com.aiclub.platform.repository.ExecutionArtifactRepository;
import com.aiclub.platform.repository.ExecutionRunRepository;
import com.aiclub.platform.repository.ExecutionStepRepository;
import com.aiclub.platform.repository.ExecutionTaskRepository;
import com.aiclub.platform.repository.ExecutionOrchestrationVersionRepository;
import com.aiclub.platform.repository.ProjectRepository;
import com.aiclub.platform.repository.ProjectGitlabBindingRepository;
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
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Set;

/**
 * 执行中心任务服务。
 * 负责执行任务的创建、查询、取消、重试，以及旧任务 Agent 运行接口的兼容适配。
 */
@Service
@Transactional(readOnly = true)
public class ExecutionTaskService {

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final String STATUS_WAITING_CONFIRMATION = "WAITING_CONFIRMATION";
    private static final String PLAN_ARTIFACT_TYPE = "PLAN_MARKDOWN";
    private static final String PLAN_ARTIFACT_TITLE = "执行规划 Markdown";
    /**
     * 需求拆解与测试设计/评审已被更贴近业务的一线能力替代：
     * 前者改由需求 AI 助手承担，后者改由需求 AI 助手的测试用例建议承载。
     * 这里仅禁止继续新建/重试，历史任务仍允许查询展示。
     */
    private static final Set<String> RETIRED_EXECUTION_SCENARIOS = Set.of(
            ExecutionWorkflowService.SCENARIO_REQUIREMENT_BREAKDOWN,
            ExecutionWorkflowService.SCENARIO_TEST_DESIGN_OR_REVIEW
    );

    private final ExecutionTaskRepository executionTaskRepository;
    private final ExecutionRunRepository executionRunRepository;
    private final ExecutionStepRepository executionStepRepository;
    private final ExecutionArtifactRepository executionArtifactRepository;
    private final ProjectRepository projectRepository;
    private final ProjectGitlabBindingRepository projectGitlabBindingRepository;
    private final TaskRepository taskRepository;
    private final UserRepository userRepository;
    private final ProjectDataPermissionService projectDataPermissionService;
    private final ExecutionWorkflowService executionWorkflowService;
    private final ExecutionDispatchService executionDispatchService;
    private final ExecutionEventService executionEventService;
    private final SelfUpgradeExecutionWritebackService selfUpgradeExecutionWritebackService;
    private final ExecutionWorkspaceCleanupService executionWorkspaceCleanupService;
    private final ExecutionTaskQueuePublisher executionTaskQueuePublisher;
    private final TechnicalDesignCreditSettlementService technicalDesignCreditSettlementService;
    private final ExecutionOrchestrationService executionOrchestrationService;
    private final ExecutionOrchestrationVersionRepository executionOrchestrationVersionRepository;
    private final ObjectMapper objectMapper;

    public ExecutionTaskService(ExecutionTaskRepository executionTaskRepository,
                                ExecutionRunRepository executionRunRepository,
                                ExecutionStepRepository executionStepRepository,
                                ExecutionArtifactRepository executionArtifactRepository,
                                ProjectRepository projectRepository,
                                ProjectGitlabBindingRepository projectGitlabBindingRepository,
                                TaskRepository taskRepository,
                                UserRepository userRepository,
                                ProjectDataPermissionService projectDataPermissionService,
                                ExecutionWorkflowService executionWorkflowService,
                                ExecutionDispatchService executionDispatchService,
                                ExecutionEventService executionEventService,
                                SelfUpgradeExecutionWritebackService selfUpgradeExecutionWritebackService,
                                ExecutionWorkspaceCleanupService executionWorkspaceCleanupService,
                                ExecutionTaskQueuePublisher executionTaskQueuePublisher,
                                TechnicalDesignCreditSettlementService technicalDesignCreditSettlementService,
                                ExecutionOrchestrationService executionOrchestrationService,
                                ExecutionOrchestrationVersionRepository executionOrchestrationVersionRepository,
                                ObjectMapper objectMapper) {
        this.executionTaskRepository = executionTaskRepository;
        this.executionRunRepository = executionRunRepository;
        this.executionStepRepository = executionStepRepository;
        this.executionArtifactRepository = executionArtifactRepository;
        this.projectRepository = projectRepository;
        this.projectGitlabBindingRepository = projectGitlabBindingRepository;
        this.taskRepository = taskRepository;
        this.userRepository = userRepository;
        this.projectDataPermissionService = projectDataPermissionService;
        this.executionWorkflowService = executionWorkflowService;
        this.executionDispatchService = executionDispatchService;
        this.executionEventService = executionEventService;
        this.selfUpgradeExecutionWritebackService = selfUpgradeExecutionWritebackService;
        this.executionWorkspaceCleanupService = executionWorkspaceCleanupService;
        this.executionTaskQueuePublisher = executionTaskQueuePublisher;
        this.technicalDesignCreditSettlementService = technicalDesignCreditSettlementService;
        this.executionOrchestrationService = executionOrchestrationService;
        this.executionOrchestrationVersionRepository = executionOrchestrationVersionRepository;
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

    /**
     * 执行中心顶部统计卡片需要脱离分页结果单独聚合，保证翻页和移动端瀑布流都不会影响统计值。
     */
    public ExecutionTaskListStatsSummary getExecutionTaskListStats(String keyword,
                                                                   String status,
                                                                   String scenarioCode,
                                                                   Long projectId) {
        ProjectDataPermissionService.ProjectDataScope scope = projectDataPermissionService.requireCurrentScope();
        if (projectId != null) {
            requireProject(projectId);
        }
        List<ExecutionTaskEntity> filteredTasks = listExecutionTasksForStats(keyword, status, scenarioCode, projectId, scope);
        int totalCount = filteredTasks.size();
        int pendingOrRunningCount = (int) filteredTasks.stream()
                .filter(item -> List.of("PENDING", "RUNNING", STATUS_WAITING_CONFIRMATION).contains(item.getStatus()))
                .count();
        int successCount = (int) filteredTasks.stream()
                .filter(item -> "SUCCESS".equalsIgnoreCase(item.getStatus()))
                .count();
        int averageProgressPercent = totalCount == 0
                ? 0
                : (int) Math.round(filteredTasks.stream()
                .mapToInt(this::progressPercentForStats)
                .average()
                .orElse(0D));
        return new ExecutionTaskListStatsSummary(
                totalCount,
                pendingOrRunningCount,
                successCount,
                averageProgressPercent
        );
    }

    public ExecutionTaskDetail getExecutionTask(Long executionTaskId) {
        return toTaskDetail(requireExecutionTask(executionTaskId));
    }

    public ExecutionTaskSummary getExecutionTaskSummary(Long executionTaskId) {
        return toTaskSummary(requireExecutionTaskWithContext(executionTaskId));
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

    public StreamingResponseBody streamExecutionRunEvents(Long executionRunId, Long afterId) {
        ExecutionRunEntity executionRun = requireExecutionRun(executionRunId);
        return executionEventService.streamRunEvents(executionRun.getId(), afterId);
    }

    /**
     * 创建新的执行中心任务，并将步骤 Agent 绑定在创建时一次性固化。
     */
    @Transactional
    public ExecutionTaskSummary createExecutionTask(CreateExecutionTaskRequest request) {
        if (ExecutionWorkflowService.SCENARIO_TECHNICAL_DESIGN_AUTHORING.equalsIgnoreCase(defaultString(request.scenarioCode()))) {
            throw new IllegalArgumentException("技术设计生成必须使用专用创建接口");
        }
        return createPageExecutionTask(request);
    }

    private ExecutionTaskSummary createPageExecutionTask(CreateExecutionTaskRequest request) {
        ProjectEntity project = requireProject(request.projectId());
        TaskEntity workItem = request.workItemId() == null ? null : requireWorkItem(project.getId(), request.workItemId());
        UserEntity currentUser = requireCurrentUser();
        ExecutionTaskEntity entity = buildExecutionTaskEntity(
                request.scenarioCode(),
                project,
                workItem,
                currentUser,
                request.title(),
                request.triggerSource(),
                workItem == null ? "MANUAL" : "WORK_ITEM",
                workItem == null ? null : workItem.getId(),
                request.planConfirmationRequired(),
                request.agentBindings(),
                request.inputPayload(),
                false
        );
        ExecutionTaskEntity saved = executionTaskRepository.save(entity);
        scheduleDispatchAfterCommit(saved.getId());
        return toTaskSummary(saved);
    }

    /**
     * 双端技术设计入口统一锁定场景和路径工作项，避免调用方伪造 workItemId 或借专用接口创建其他场景。
     */
    @Transactional
    public ExecutionTaskSummary createTechnicalDesignExecution(Long workItemId, CreateExecutionTaskRequest request) {
        boolean publicOnly = AuthContextHolder.get()
                .map(context -> context.roleCodes() != null
                        && context.roleCodes().size() == 1
                        && context.roleCodes().contains("PUBLIC_DEFAULT"))
                .orElse(false);
        if (publicOnly) {
            throw new ForbiddenException("公众端用户必须通过积分结算入口创建技术设计任务");
        }
        return createDedicatedTechnicalDesignExecution(workItemId, request);
    }

    /**
     * 公众端专用入口由上层先完成积分预扣，随后才允许进入同一领域创建逻辑。
     */
    @Transactional
    public ExecutionTaskSummary createPublicTechnicalDesignExecution(Long workItemId, CreateExecutionTaskRequest request) {
        return createDedicatedTechnicalDesignExecution(workItemId, request);
    }

    private ExecutionTaskSummary createDedicatedTechnicalDesignExecution(Long workItemId, CreateExecutionTaskRequest request) {
        CreateExecutionTaskRequest normalizedRequest = new CreateExecutionTaskRequest(
                ExecutionWorkflowService.SCENARIO_TECHNICAL_DESIGN_AUTHORING,
                request.projectId(),
                workItemId,
                request.title(),
                request.triggerSource(),
                false,
                request.agentBindings(),
                request.inputPayload()
        );
        return createPageExecutionTask(normalizedRequest);
    }

    /**
     * 平台内部模块可以通过该入口创建执行任务，并显式写入 sourceType/sourceId/createdByUser，
     * 同时跳过页面可见性校验，便于自升级中心等内部模块复用执行中心能力。
     */
    @Transactional
    public ExecutionTaskEntity createInternalExecutionTask(InternalCreateExecutionTaskCommand command) {
        ProjectEntity project = requireProjectInternal(command.projectId());
        TaskEntity workItem = command.workItemId() == null ? null : requireWorkItemInternal(project.getId(), command.workItemId());
        UserEntity createdByUser = command.createdByUserId() == null ? null : requireUser(command.createdByUserId());
        ExecutionTaskEntity entity = buildExecutionTaskEntity(
                command.scenarioCode(),
                project,
                workItem,
                createdByUser,
                command.title(),
                command.triggerSource(),
                command.sourceType(),
                command.sourceId(),
                command.planConfirmationRequired(),
                command.agentBindings(),
                command.inputPayload(),
                true
        );
        ExecutionTaskEntity saved = executionTaskRepository.save(entity);
        scheduleDispatchAfterCommit(saved.getId());
        return saved;
    }

    /**
     * 取消执行任务。
     * 待执行任务会直接取消；执行中任务会在步骤边界停止。
     */
    @Transactional
    public ExecutionTaskSummary cancelExecutionTask(Long executionTaskId) {
        ExecutionTaskEntity executionTask = requireExecutionTaskWithContext(executionTaskId);
        if ("PENDING".equals(executionTask.getStatus())) {
            executionTask.setStatus("CANCELED");
            executionTask.setCancelRequested(false);
            executionTask.setLatestSummary("执行已取消");
            ExecutionTaskEntity saved = executionTaskRepository.save(executionTask);
            if (ExecutionWorkflowService.SCENARIO_TECHNICAL_DESIGN_AUTHORING.equalsIgnoreCase(saved.getScenarioCode())) {
                technicalDesignCreditSettlementService.settleTerminalTask(saved.getId());
            }
            selfUpgradeExecutionWritebackService.handleExecutionFinished(saved, saved.getCurrentRun(), "CANCELED");
            return toTaskSummary(saved);
        }
        if (STATUS_WAITING_CONFIRMATION.equals(executionTask.getStatus())) {
            cancelWaitingConfirmationTask(executionTask);
            return toTaskSummary(executionTask);
        }
        if ("RUNNING".equals(executionTask.getStatus())) {
            executionTask.setCancelRequested(true);
            executionTask.setLatestSummary("已请求取消，正在尝试停止当前步骤");
            executionTaskRepository.save(executionTask);
            if (executionDispatchService.requestCancelRunningTask(executionTaskId)) {
                return toTaskSummary(requireExecutionTaskWithContext(executionTaskId));
            }
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
        ExecutionTaskEntity executionTask = requireExecutionTaskWithContext(executionTaskId);
        requireScenarioAvailableForExecutionEntry(executionTask.getScenarioCode(), "重试");
        if ("RUNNING".equals(executionTask.getStatus()) || "PENDING".equals(executionTask.getStatus())) {
            throw new IllegalArgumentException("当前执行任务仍在处理中，暂不可重试");
        }
        executionTask.setStatus("PENDING");
        executionTask.setCancelRequested(false);
        executionTask.setLatestSummary("已重新排队");
        ExecutionTaskEntity saved = executionTaskRepository.save(executionTask);
        scheduleDispatchAfterCommit(saved.getId());
        return toTaskSummary(saved);
    }

    /**
     * 兼容旧任务 Agent 运行入口：创建执行任务并立即执行。
     */
    @Transactional
    public ExecutionTaskSummary createLegacyExecutionTask(Long workItemId, String inputText) {
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
                false,
                List.of(new ExecutionAgentBindingRequest(ExecutionWorkflowService.STEP_AD_HOC_RUN, workItem.getAgent().getId())),
                Map.of("inputText", defaultString(inputText).trim())
        );
        return createExecutionTask(request);
    }

    /**
     * 规划确认页允许发起人对 PLAN 产物做最终润色，后续 IMPLEMENT / TEST / REPORT 都会以这份内容为准。
     */
    @Transactional
    public ExecutionTaskDetail updateExecutionPlanMarkdown(Long executionTaskId,
                                                           UpdateExecutionPlanMarkdownRequest request) {
        ExecutionTaskEntity executionTask = requireExecutionTaskWithContext(executionTaskId);
        requirePlanConfirmationEditor(executionTask);
        overwritePlanMarkdown(executionTask, request.planMarkdown());
        return toTaskDetail(requireExecutionTaskWithContext(executionTaskId));
    }

    /**
     * 发起人确认规划后，把任务重新置回待调度态，并在事务提交后续跑原 run。
     */
    @Transactional
    public ExecutionTaskDetail confirmExecutionPlan(Long executionTaskId,
                                                    ConfirmExecutionPlanRequest request) {
        ExecutionTaskEntity executionTask = requireExecutionTaskWithContext(executionTaskId);
        requirePlanConfirmationEditor(executionTask);
        overwritePlanMarkdown(executionTask, request.planMarkdown());
        executionTask.setStatus("PENDING");
        executionTask.setCancelRequested(false);
        executionTask.setLatestSummary("执行规划已确认，等待继续执行");
        executionTaskRepository.save(executionTask);
        scheduleDispatchAfterCommit(executionTask.getId());
        return toTaskDetail(requireExecutionTaskWithContext(executionTaskId));
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
     * 统计接口一次性预取 currentRun，避免按条访问进度字段时触发 N+1 查询。
     */
    private List<ExecutionTaskEntity> listExecutionTasksForStats(String keyword,
                                                                 String status,
                                                                 String scenarioCode,
                                                                 Long projectId,
                                                                 ProjectDataPermissionService.ProjectDataScope scope) {
        Specification<ExecutionTaskEntity> baseSpecification =
                executionTaskSpecification(keyword, status, scenarioCode, projectId, scope);
        return executionTaskRepository.findAll((root, query, cb) -> {
            root.fetch("currentRun", JoinType.LEFT);
            query.distinct(true);
            return baseSpecification.toPredicate(root, query, cb);
        });
    }

    /**
     * 顶部卡片的平均进度与列表页展示口径保持一致，统一兜底到 0-100。
     */
    private int progressPercentForStats(ExecutionTaskEntity executionTask) {
        ExecutionRunEntity currentRun = executionTask.getCurrentRun();
        int rawValue = currentRun == null || currentRun.getProgressPercent() == null
                ? 0
                : currentRun.getProgressPercent();
        return Math.min(100, Math.max(0, rawValue));
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
        boolean planConfirmationRequired = isPlanConfirmationRequired(executionTask.getInputPayload());
        boolean planConfirmationPending = STATUS_WAITING_CONFIRMATION.equalsIgnoreCase(executionTask.getStatus());
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
                planConfirmationRequired,
                planConfirmationPending,
                executionTask.getCreatedByUser() == null ? null : executionTask.getCreatedByUser().getId(),
                displayName(executionTask.getCreatedByUser()),
                formatTime(executionTask.getCreatedAt()),
                formatTime(executionTask.getUpdatedAt()),
                executionTask.getOrchestrationVersion() == null ? null : executionTask.getOrchestrationVersion().getId(),
                readResolvedBindings(executionTask.getAgentBindingPayload())
        );
    }

    private ExecutionTaskDetail toTaskDetail(ExecutionTaskEntity executionTask) {
        List<ExecutionRunSummary> runs = executionRunRepository.findAllByExecutionTask_IdOrderByRunNoDescIdDesc(executionTask.getId()).stream()
                .map(this::toRunSummary)
                .toList();
        boolean planConfirmationRequired = isPlanConfirmationRequired(executionTask.getInputPayload());
        boolean planConfirmationPending = STATUS_WAITING_CONFIRMATION.equalsIgnoreCase(executionTask.getStatus());
        ExecutionWorkspaceCleanupSummary workspaceCleanup = executionWorkspaceCleanupService.buildTaskSummary(
                executionTask.getId(),
                executionTask.getScenarioCode()
        );
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
                planConfirmationRequired,
                planConfirmationPending,
                planConfirmationPending && canCurrentUserConfirmPlan(executionTask),
                runs,
                workspaceCleanup,
                executionTask.getOrchestrationVersion() == null ? null : executionTask.getOrchestrationVersion().getId(),
                readResolvedBindings(executionTask.getAgentBindingPayload())
        );
    }

    /** 只读解析任务中已固化的绑定 JSON，兼容 timeoutSeconds 尚不存在的历史任务。 */
    private List<ExecutionResolvedBindingSummary> readResolvedBindings(String payload) {
        if (!hasText(payload)) return List.of();
        try {
            com.fasterxml.jackson.databind.JsonNode root = objectMapper.readTree(payload);
            if (!root.isArray()) return List.of();
            List<ExecutionResolvedBindingSummary> result = new ArrayList<>();
            for (com.fasterxml.jackson.databind.JsonNode item : root) {
                result.add(new ExecutionResolvedBindingSummary(
                        item.path("stepNo").isNumber() ? item.path("stepNo").asInt() : null,
                        item.path("stepCode").asText(""), item.path("stepName").asText(""),
                        item.path("agentId").isNumber() ? item.path("agentId").asLong() : null,
                        item.path("agentName").isTextual() ? item.path("agentName").asText() : null,
                        item.path("accessType").isTextual() ? item.path("accessType").asText() : null,
                        item.path("runtimeType").isTextual() ? item.path("runtimeType").asText() : null,
                        item.path("timeoutSeconds").isNumber() ? item.path("timeoutSeconds").asInt() : null,
                        item.path("repositoryBindingId").isNumber() ? item.path("repositoryBindingId").asLong() : null,
                        item.path("repositoryTargetBranch").isTextual() ? item.path("repositoryTargetBranch").asText() : null,
                        item.path("repositoryDisplayName").isTextual() ? item.path("repositoryDisplayName").asText() : null));
            }
            return List.copyOf(result);
        } catch (Exception ignored) {
            return List.of();
        }
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
        Long lastEventId = executionEventService.latestRunEventId(executionRun.getId());
        boolean hasLiveStream = steps.stream().anyMatch(ExecutionStepSummary::hasLiveStream);
        String lastEventAt = steps.stream()
                .map(ExecutionStepSummary::lastEventAt)
                .filter(this::hasText)
                .reduce((first, second) -> second)
                .orElse(null);
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
                lastEventId,
                lastEventAt,
                hasLiveStream,
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
                trimToNull(executionStep.getCurrentCommand()),
                executionStep.getLastEventId(),
                formatTime(executionStep.getLastEventAt()),
                formatTime(executionStep.getLastHeartbeatAt()),
                executionStep.getTailLogText(),
                executionStep.getTailLogLineCount(),
                executionStep.isHasLiveStream(),
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

    private ProjectEntity requireProjectInternal(Long projectId) {
        return projectRepository.findById(projectId)
                .orElseThrow(() -> new NoSuchElementException("项目不存在: " + projectId));
    }

    private TaskEntity requireWorkItem(Long projectId, Long workItemId) {
        TaskEntity workItem = requireWorkItemVisible(workItemId);
        if (!workItem.getProject().getId().equals(projectId)) {
            throw new IllegalArgumentException("工作项必须属于当前项目");
        }
        return workItem;
    }

    private TaskEntity requireWorkItemInternal(Long projectId, Long workItemId) {
        TaskEntity workItem = taskRepository.findById(workItemId)
                .orElseThrow(() -> new NoSuchElementException("工作项不存在: " + workItemId));
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

    private ExecutionTaskEntity requireExecutionTaskWithContext(Long executionTaskId) {
        ExecutionTaskEntity executionTask = executionTaskRepository.findWithExecutionContextById(executionTaskId)
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
        return requireUser(userId);
    }

    private UserEntity requireUser(Long userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new NoSuchElementException("用户不存在: " + userId));
    }

    private void requirePlanConfirmationEditor(ExecutionTaskEntity executionTask) {
        if (!ExecutionWorkflowService.SCENARIO_DEVELOPMENT_IMPLEMENTATION.equalsIgnoreCase(executionTask.getScenarioCode())
                || !isPlanConfirmationRequired(executionTask.getInputPayload())) {
            throw new IllegalArgumentException("当前执行任务未开启规划确认流程");
        }
        if (!STATUS_WAITING_CONFIRMATION.equalsIgnoreCase(executionTask.getStatus())) {
            throw new IllegalStateException("当前执行任务不处于待确认状态");
        }
        if (!canCurrentUserConfirmPlan(executionTask)) {
            throw new ForbiddenException("只有执行任务发起人可以编辑并确认执行规划");
        }
        if (executionTask.getCurrentRun() == null) {
            throw new IllegalStateException("当前执行任务缺少待确认运行记录");
        }
    }

    /**
     * 待确认态的开发执行还没有最终收口，这里只允许发起人修改 PLAN 步骤产物，
     * 避免后续 IMPLEMENT / TEST 仍然读取旧版规划。
     */
    private void overwritePlanMarkdown(ExecutionTaskEntity executionTask, String rawPlanMarkdown) {
        ExecutionRunEntity currentRun = executionTask.getCurrentRun();
        if (currentRun == null) {
            throw new IllegalStateException("当前执行任务缺少运行记录");
        }
        String planMarkdown = rawPlanMarkdown == null ? "" : rawPlanMarkdown.strip();
        if (!hasText(planMarkdown)) {
            throw new IllegalArgumentException("执行规划不能为空");
        }

        ExecutionStepEntity planStep = executionStepRepository.findAllByRun_IdOrderByStepNoAscIdAsc(currentRun.getId()).stream()
                .filter(step -> ExecutionWorkflowService.STEP_PLAN.equalsIgnoreCase(defaultString(step.getStepCode())))
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("当前执行任务缺少执行规划步骤"));
        planStep.setOutputSnapshot(planMarkdown);
        executionStepRepository.save(planStep);

        executionArtifactRepository.findFirstByRun_IdAndArtifactTypeAndTitle(currentRun.getId(), PLAN_ARTIFACT_TYPE, PLAN_ARTIFACT_TITLE)
                .ifPresent(artifact -> {
                    artifact.setContentText(planMarkdown);
                    executionArtifactRepository.save(artifact);
                });

        currentRun.setOutputSummary("执行规划已生成，等待发起人确认");
        executionRunRepository.save(currentRun);

        executionTask.setLatestSummary("执行规划已完成，等待发起人确认");
        executionTaskRepository.save(executionTask);
    }

    private void cancelWaitingConfirmationTask(ExecutionTaskEntity executionTask) {
        ExecutionRunEntity currentRun = executionTask.getCurrentRun();
        if (currentRun != null) {
            currentRun.setStatus("CANCELED");
            currentRun.setFinishedAt(LocalDateTime.now());
            currentRun.setUpdatedAt(LocalDateTime.now());
            currentRun.setOutputSummary("执行任务已取消，未继续后续步骤。");
            executionRunRepository.save(currentRun);

            ExecutionArtifactEntity artifact = new ExecutionArtifactEntity();
            artifact.setRun(currentRun);
            artifact.setArtifactType("FINAL_SUMMARY");
            artifact.setTitle("取消摘要");
            artifact.setContentText("执行任务已取消，未继续后续步骤。");
            artifact.setWorkItemWritebackFlag(false);
            ExecutionArtifactEntity savedArtifact = executionArtifactRepository.save(artifact);
            executionEventService.recordArtifactReady(executionTask, currentRun, null, savedArtifact.getId(), savedArtifact.getTitle());
        }
        executionTask.setStatus("CANCELED");
        executionTask.setCancelRequested(false);
        executionTask.setLatestSummary("执行已取消");
        executionTaskRepository.save(executionTask);
        selfUpgradeExecutionWritebackService.handleExecutionFinished(executionTask, currentRun, "CANCELED");
        if (currentRun != null) {
            executionWorkspaceCleanupService.scheduleCleanupForRun(
                    currentRun.getId(),
                    "CANCELED",
                    LocalDateTime.now()
            );
        }
    }

    private void scheduleDispatchAfterCommit(Long executionTaskId) {
        executionTaskQueuePublisher.publishAfterCommit(executionTaskId);
    }

    /**
     * 统一整理外部页面入口与内部平台入口的执行任务创建逻辑，
     * 保证步骤绑定、规划确认和输入载荷序列化规则完全一致。
     */
    private ExecutionTaskEntity buildExecutionTaskEntity(String scenarioCode,
                                                         ProjectEntity project,
                                                         TaskEntity workItem,
                                                         UserEntity createdByUser,
                                                         String requestedTitle,
                                                         String triggerSource,
                                                         String sourceType,
                                                         Long sourceId,
                                                         Boolean requestedPlanConfirmationRequired,
                                                         List<ExecutionAgentBindingRequest> agentBindings,
                                                         Map<String, Object> rawInputPayload,
                                                         boolean skipPermissionChecks) {
        requireScenarioAvailableForExecutionEntry(scenarioCode, "创建");
        Map<String, Object> normalizedPayload = defaultPayload(rawInputPayload);
        validateTechnicalDesignWorkItem(scenarioCode, workItem);
        String normalizedTriggerSource = normalizeTriggerSource(triggerSource);
        boolean planConfirmationRequired = normalizePlanConfirmationRequired(
                scenarioCode,
                normalizedTriggerSource,
                requestedPlanConfirmationRequired
        );
        normalizedPayload.put("planConfirmationRequired", planConfirmationRequired);
        if (executionOrchestrationService.isManagedScenario(scenarioCode) && !skipPermissionChecks
                && agentBindings != null && !agentBindings.isEmpty()) {
            throw new IllegalArgumentException("受管执行场景不允许指定 Agent，请由管理员发布执行编排");
        }
        List<ExecutionWorkflowService.DevelopmentRepositorySelection> developmentRepositories =
                resolveExecutionRepositories(scenarioCode, project, normalizedPayload, skipPermissionChecks);
        List<ExecutionAgentBindingRequest> effectiveBindings = agentBindings;
        Long orchestrationVersionId = null;
        if (executionOrchestrationService.isManagedScenario(scenarioCode) && !skipPermissionChecks) {
            ExecutionOrchestrationService.ResolvedOrchestration resolved = executionOrchestrationService.resolve(
                    project.getId(), scenarioCode);
            effectiveBindings = resolved.agentBindings();
            orchestrationVersionId = resolved.versionId();
        }
        ExecutionWorkflowService.WorkflowPlan workflowPlan = executionWorkflowService.buildWorkflow(
                scenarioCode,
                project.getId(),
                effectiveBindings,
                developmentRepositories
        );
        validateDevelopmentExecutionAgents(workflowPlan);
        validateTechnicalDesignAgents(workflowPlan);

        ExecutionTaskEntity entity = new ExecutionTaskEntity();
        entity.setSourceType(trimToNull(sourceType) == null ? (workItem == null ? "MANUAL" : "WORK_ITEM") : sourceType.trim().toUpperCase());
        entity.setSourceId(sourceId == null && workItem != null ? workItem.getId() : sourceId);
        entity.setTriggerSource(normalizedTriggerSource);
        entity.setScenarioCode(workflowPlan.scenarioCode());
        entity.setTitle(resolveExecutionTaskTitle(requestedTitle, workflowPlan.scenarioName(), workItem));
        entity.setProject(project);
        entity.setWorkItem(workItem);
        entity.setCreatedByUser(createdByUser);
        entity.setStatus("PENDING");
        entity.setCancelRequested(false);
        entity.setLatestSummary("等待调度");
        entity.setInputPayload(serializePayload(normalizedPayload));
        entity.setAgentBindingPayload(executionWorkflowService.serializeBindings(workflowPlan));
        if (orchestrationVersionId != null) {
            entity.setOrchestrationVersion(executionOrchestrationVersionRepository.getReferenceById(orchestrationVersionId));
        }
        return entity;
    }

    private Map<String, Object> defaultPayload(Map<String, Object> inputPayload) {
        return inputPayload == null ? new LinkedHashMap<>() : new LinkedHashMap<>(inputPayload);
    }

    /**
     * 多仓开发执行在创建阶段就完成仓库列表校验与标准化，避免调度时才暴露基础数据缺失问题。
     */
    private List<ExecutionWorkflowService.DevelopmentRepositorySelection> resolveExecutionRepositories(String scenarioCode,
                                                                                                        ProjectEntity project,
                                                                                                        Map<String, Object> inputPayload,
                                                                                                        boolean skipPermissionChecks) {
        boolean developmentExecution = ExecutionWorkflowService.SCENARIO_DEVELOPMENT_IMPLEMENTATION.equalsIgnoreCase(defaultString(scenarioCode));
        boolean technicalDesign = ExecutionWorkflowService.SCENARIO_TECHNICAL_DESIGN_AUTHORING.equalsIgnoreCase(defaultString(scenarioCode));
        if (!developmentExecution && !technicalDesign) {
            return List.of();
        }
        String sceneLabel = technicalDesign ? "技术设计生成" : "开发执行";
        String inputText = trimToNull(asText(inputPayload.get("inputText")));
        if (inputText == null) {
            inputPayload.remove("inputText");
        } else {
            inputPayload.put("inputText", inputText);
        }

        Object repositoriesValue = inputPayload.get("repositories");
        if (!(repositoriesValue instanceof List<?> repositories) || repositories.isEmpty()) {
            throw new IllegalArgumentException(sceneLabel + "至少需要选择一个 GitLab 仓库");
        }

        List<Map<String, Object>> normalizedRepositories = new ArrayList<>();
        List<ExecutionWorkflowService.DevelopmentRepositorySelection> result = new ArrayList<>();
        Set<Long> uniqueBindingIds = new LinkedHashSet<>();
        for (Object item : repositories) {
            if (!(item instanceof Map<?, ?> repositoryItem)) {
                throw new IllegalArgumentException(sceneLabel + "仓库参数格式不正确");
            }
            Long bindingId = parseBindingId(repositoryItem.get("bindingId"));
            if (bindingId == null) {
                throw new IllegalArgumentException(sceneLabel + "仓库必须填写 bindingId");
            }
            if (!uniqueBindingIds.add(bindingId)) {
                throw new IllegalArgumentException(sceneLabel + "仓库不允许重复选择同一个 GitLab 绑定");
            }
            String targetBranch = trimToNull(asText(repositoryItem.get("targetBranch")));
            if (targetBranch == null) {
                throw new IllegalArgumentException(sceneLabel + "仓库必须填写目标分支");
            }
            ProjectGitlabBindingEntity binding = requireDevelopmentBinding(project.getId(), bindingId, skipPermissionChecks);
            normalizedRepositories.add(Map.of(
                    "bindingId", bindingId,
                    "targetBranch", targetBranch
            ));
            result.add(new ExecutionWorkflowService.DevelopmentRepositorySelection(
                    bindingId,
                    targetBranch,
                    resolveBindingDisplayName(binding)
            ));
        }
        inputPayload.put("repositories", normalizedRepositories);
        return result;
    }

    /**
     * 技术设计 Runtime 是技术设计任务的专用上游能力，不能被其他工作项类型绕过入口调用。
     */
    private void validateTechnicalDesignWorkItem(String scenarioCode, TaskEntity workItem) {
        if (!ExecutionWorkflowService.SCENARIO_TECHNICAL_DESIGN_AUTHORING.equalsIgnoreCase(defaultString(scenarioCode))) {
            return;
        }
        if (workItem == null
                || !"任务".equals(defaultString(workItem.getWorkItemType()).trim())
                || !"技术设计".equals(defaultString(workItem.getTaskType()).trim())) {
            throw new IllegalArgumentException("技术设计生成仅支持任务类型为“技术设计”的工作项");
        }
    }

    /**
     * 技术设计三步只能使用具备真实仓库读取能力的 Codex/Claude CLI Runtime。
     */
    private void validateTechnicalDesignAgents(ExecutionWorkflowService.WorkflowPlan workflowPlan) {
        if (!ExecutionWorkflowService.SCENARIO_TECHNICAL_DESIGN_AUTHORING.equalsIgnoreCase(workflowPlan.scenarioCode())) {
            return;
        }
        for (ExecutionWorkflowService.ExecutionStepPlan step : workflowPlan.steps()) {
            if (step.agent() == null
                    || !AgentExecutionService.ACCESS_AGENT_RUNTIME.equalsIgnoreCase(defaultString(step.agent().getAccessType()))) {
                throw new IllegalArgumentException(step.stepName() + " 必须绑定 AGENT_RUNTIME 智能体");
            }
            String runtimeType = defaultString(step.agent().getRuntimeType()).trim().toUpperCase();
            if (!AgentExecutionService.RUNTIME_CODEX_CLI.equals(runtimeType)
                    && !AgentExecutionService.RUNTIME_CLAUDE_CODE_CLI.equals(runtimeType)) {
                throw new IllegalArgumentException(step.stepName() + " 仅支持 CODEX_CLI 或 CLAUDE_CODE_CLI Runtime");
            }
        }
    }

    private void validateDevelopmentExecutionAgents(ExecutionWorkflowService.WorkflowPlan workflowPlan) {
        if (!ExecutionWorkflowService.SCENARIO_DEVELOPMENT_IMPLEMENTATION.equalsIgnoreCase(workflowPlan.scenarioCode())) {
            return;
        }
        for (ExecutionWorkflowService.ExecutionStepPlan step : workflowPlan.steps()) {
            if (!ExecutionWorkflowService.STEP_IMPLEMENT.equals(step.stepCode())
                    && !ExecutionWorkflowService.STEP_TEST.equals(step.stepCode())) {
                continue;
            }
            String accessType = defaultString(step.agent().getAccessType()).trim().toUpperCase();
            if (!"HTTP_API".equals(accessType) && !"AGENT_RUNTIME".equals(accessType)) {
                throw new IllegalArgumentException(step.stepName() + " 必须绑定可真实执行的 HTTP_API 或 AGENT_RUNTIME 智能体");
            }
        }
    }

    private ProjectGitlabBindingEntity requireDevelopmentBinding(Long projectId, Long bindingId, boolean skipPermissionChecks) {
        ProjectGitlabBindingEntity binding = projectGitlabBindingRepository.findById(bindingId)
                .orElseThrow(() -> new NoSuchElementException("GitLab 绑定不存在: " + bindingId));
        if (!skipPermissionChecks) {
            projectDataPermissionService.requireGitlabBindingVisible(binding);
        }
        if (!binding.getProject().getId().equals(projectId)) {
            throw new IllegalArgumentException("GitLab 绑定必须属于当前项目");
        }
        if (!Boolean.TRUE.equals(binding.getEnabled())) {
            throw new IllegalArgumentException("所选 GitLab 绑定已停用，无法用于开发执行");
        }
        return binding;
    }

    private Long parseBindingId(Object rawValue) {
        if (rawValue instanceof Number number) {
            return number.longValue();
        }
        if (rawValue instanceof String value && hasText(value)) {
            try {
                return Long.parseLong(value.trim());
            } catch (NumberFormatException ignored) {
                return null;
            }
        }
        return null;
    }

    private String resolveBindingDisplayName(ProjectGitlabBindingEntity binding) {
        String path = trimToNull(binding.getGitlabProjectPath());
        if (path != null) {
            return path;
        }
        String ref = trimToNull(binding.getGitlabProjectRef());
        return ref == null ? "GitLab 绑定 #" + binding.getId() : ref;
    }

    private String asText(Object value) {
        return value == null ? null : String.valueOf(value);
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

    private boolean normalizePlanConfirmationRequired(String scenarioCode,
                                                      String triggerSource,
                                                      Boolean requestedPlanConfirmationRequired) {
        if (!ExecutionWorkflowService.SCENARIO_DEVELOPMENT_IMPLEMENTATION.equalsIgnoreCase(defaultString(scenarioCode))) {
            return false;
        }
        if (!"PAGE".equalsIgnoreCase(defaultString(triggerSource))
                && !"SELF_UPGRADE_CENTER".equalsIgnoreCase(defaultString(triggerSource))) {
            return false;
        }
        return Boolean.TRUE.equals(requestedPlanConfirmationRequired);
    }

    private String normalizeTriggerSource(String triggerSource) {
        if (!hasText(triggerSource)) {
            return "PAGE";
        }
        return triggerSource.trim().toUpperCase();
    }

    private boolean isPlanConfirmationRequired(String inputPayload) {
        if (!hasText(inputPayload)) {
            return false;
        }
        try {
            return objectMapper.readTree(inputPayload).path("planConfirmationRequired").asBoolean(false);
        } catch (Exception ignored) {
            return false;
        }
    }

    private boolean canCurrentUserConfirmPlan(ExecutionTaskEntity executionTask) {
        Long currentUserId = AuthContextHolder.get().map(authContext -> authContext.userId()).orElse(null);
        return currentUserId != null
                && executionTask.getCreatedByUser() != null
                && currentUserId.equals(executionTask.getCreatedByUser().getId());
    }

    private void requireScenarioAvailableForExecutionEntry(String scenarioCode, String actionLabel) {
        String normalizedScenarioCode = defaultString(scenarioCode).trim().toUpperCase();
        if (!RETIRED_EXECUTION_SCENARIOS.contains(normalizedScenarioCode)) {
            return;
        }
        if (ExecutionWorkflowService.SCENARIO_REQUIREMENT_BREAKDOWN.equals(normalizedScenarioCode)) {
            throw new IllegalArgumentException(actionLabel + "“需求拆解”执行任务已下线，请改用需求 AI 助手中的“拆解子任务”能力");
        }
        if (ExecutionWorkflowService.SCENARIO_TEST_DESIGN_OR_REVIEW.equals(normalizedScenarioCode)) {
            throw new IllegalArgumentException(actionLabel + "“测试设计/评审”执行任务已下线，请改用需求 AI 助手中的“生成测试用例”能力");
        }
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

    private String trimToNull(String value) {
        return hasText(value) ? value.trim() : null;
    }

    private String defaultString(String value) {
        return value == null ? "" : value;
    }

    /**
     * 平台内部模块创建执行任务时使用的命令对象。
     * sourceType/sourceId/createdByUserId 会被原样写入执行任务，便于后续做业务回写。
     */
    public record InternalCreateExecutionTaskCommand(
            String scenarioCode,
            Long projectId,
            Long workItemId,
            String title,
            String triggerSource,
            String sourceType,
            Long sourceId,
            Long createdByUserId,
            Boolean planConfirmationRequired,
            List<ExecutionAgentBindingRequest> agentBindings,
            Map<String, Object> inputPayload
    ) {
    }
}
