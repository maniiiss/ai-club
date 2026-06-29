package com.aiclub.platform.service;

import com.aiclub.platform.common.DataPermissionScopeType;
import com.aiclub.platform.domain.model.AiModelConfigEntity;
import com.aiclub.platform.domain.model.AgentEntity;
import com.aiclub.platform.domain.model.IterationEntity;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.TaskCommentEntity;
import com.aiclub.platform.domain.model.TaskEntity;
import com.aiclub.platform.domain.model.TaskPrdProjectionEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.AgentSummary;
import com.aiclub.platform.dto.DashboardCardOverview;
import com.aiclub.platform.dto.DashboardOverview;
import com.aiclub.platform.dto.DashboardStats;
import com.aiclub.platform.dto.IterationBoardSummary;
import com.aiclub.platform.dto.IterationSummary;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.ProjectMemberSummary;
import com.aiclub.platform.dto.ProjectListStatsSummary;
import com.aiclub.platform.dto.ProjectSummary;
import com.aiclub.platform.dto.ProjectBurndownSummary;
import com.aiclub.platform.dto.ProjectWorkItemStatsSummary;
import com.aiclub.platform.dto.TaskCommentSummary;
import com.aiclub.platform.dto.TaskSummary;
import com.aiclub.platform.dto.request.AgentRequest;
import com.aiclub.platform.dto.request.IterationRequest;
import com.aiclub.platform.dto.request.ProjectRequest;
import com.aiclub.platform.dto.request.TaskCommentRequest;
import com.aiclub.platform.dto.request.TaskRequest;
import com.aiclub.platform.exception.UnauthorizedException;
import com.aiclub.platform.repository.AiModelConfigRepository;
import com.aiclub.platform.repository.AgentRepository;
import com.aiclub.platform.repository.IterationRepository;
import com.aiclub.platform.repository.ProjectGitlabBindingRepository;
import com.aiclub.platform.repository.TaskGiteeBindingRepository;
import com.aiclub.platform.repository.ProjectRepository;
import com.aiclub.platform.repository.TaskCommentRepository;
import com.aiclub.platform.repository.TaskPrdProjectionRepository;
import com.aiclub.platform.repository.TaskRepository;
import com.aiclub.platform.repository.UserRepository;
import com.aiclub.platform.security.AuthContextHolder;
import com.aiclub.platform.util.RequirementDocumentUtils;
import com.aiclub.platform.util.RichTextUtils;
import com.aiclub.platform.util.TaskStatusUtils;
import jakarta.persistence.criteria.From;
import jakarta.persistence.criteria.JoinType;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Objects;
import java.util.Set;

@Service
@Transactional(readOnly = true)
public class PlatformStoreService {

    private static final Logger log = LoggerFactory.getLogger(PlatformStoreService.class);

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final DateTimeFormatter DATE_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final String WORK_ITEM_CODE_PREFIX = "#";
    private static final String WORK_ITEM_CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    private static final int WORK_ITEM_CODE_RANDOM_LENGTH = 6;
    private static final String DEFAULT_REQUIREMENT_MODULE_NAME = "未分类";

    private final ProjectRepository projectRepository;
    private final ProjectGitlabBindingRepository projectGitlabBindingRepository;
    private final AgentRepository agentRepository;
    private final AiModelConfigRepository aiModelConfigRepository;
    private final IterationRepository iterationRepository;
    private final TaskRepository taskRepository;
    private final TaskGiteeBindingRepository taskGiteeBindingRepository;
    private final TaskCommentRepository taskCommentRepository;
    private final TaskPrdProjectionRepository taskPrdProjectionRepository;
    private final UserRepository userRepository;
    private final TokenCipherService tokenCipherService;
    private final TaskNotificationService taskNotificationService;
    private final KnowledgeGraphService knowledgeGraphService;
    private final ProjectDataPermissionService projectDataPermissionService;
    private final RequirementModuleOptionService requirementModuleOptionService;
    private final TaskPrdService taskPrdService;
    private final DashboardShortcutEntryService dashboardShortcutEntryService;
    private final SecureRandom workItemCodeRandom = new SecureRandom();

    public PlatformStoreService(ProjectRepository projectRepository,
                                ProjectGitlabBindingRepository projectGitlabBindingRepository,
                                AgentRepository agentRepository,
                                AiModelConfigRepository aiModelConfigRepository,
                                IterationRepository iterationRepository,
                                TaskRepository taskRepository,
                                TaskGiteeBindingRepository taskGiteeBindingRepository,
                                TaskCommentRepository taskCommentRepository,
                                TaskPrdProjectionRepository taskPrdProjectionRepository,
                                UserRepository userRepository,
                                TokenCipherService tokenCipherService,
                                TaskNotificationService taskNotificationService,
                                KnowledgeGraphService knowledgeGraphService,
                                ProjectDataPermissionService projectDataPermissionService,
                                RequirementModuleOptionService requirementModuleOptionService,
                                TaskPrdService taskPrdService,
                                DashboardShortcutEntryService dashboardShortcutEntryService) {
        this.projectRepository = projectRepository;
        this.projectGitlabBindingRepository = projectGitlabBindingRepository;
        this.agentRepository = agentRepository;
        this.aiModelConfigRepository = aiModelConfigRepository;
        this.iterationRepository = iterationRepository;
        this.taskRepository = taskRepository;
        this.taskGiteeBindingRepository = taskGiteeBindingRepository;
        this.taskCommentRepository = taskCommentRepository;
        this.taskPrdProjectionRepository = taskPrdProjectionRepository;
        this.userRepository = userRepository;
        this.tokenCipherService = tokenCipherService;
        this.taskNotificationService = taskNotificationService;
        this.knowledgeGraphService = knowledgeGraphService;
        this.projectDataPermissionService = projectDataPermissionService;
        this.requirementModuleOptionService = requirementModuleOptionService;
        this.taskPrdService = taskPrdService;
        this.dashboardShortcutEntryService = dashboardShortcutEntryService;
    }

    public DashboardOverview getDashboardOverview() {
        List<ProjectSummary> projectList = listAllProjects();
        List<AgentSummary> agentList = listAllAgents();
        List<TaskSummary> taskList = listAllTasks();

        DashboardStats stats = new DashboardStats(
                projectList.size(),
                agentList.size(),
                taskList.size(),
                projectList.size(),
                0,
                0,
                0,
                0,
                0
        );

        return new DashboardOverview(
                stats,
                projectList,
                agentList,
                taskList.stream().limit(8).toList(),
                dashboardShortcutEntryService.getCurrentUserShortcutOverview(),
                null,
                List.of(),
                List.of(),
                List.of(),
                null,
                null
        );
    }

    /**
     * 读取首页卡片基础概览，供前端按卡片维度并行加载。
     */
    public DashboardCardOverview getDashboardCardOverview() {
        List<ProjectSummary> projectList = listAllProjects();
        List<AgentSummary> agentList = listAllAgents();
        List<TaskSummary> taskList = listAllTasks();
        DashboardStats stats = new DashboardStats(
                projectList.size(),
                agentList.size(),
                taskList.size(),
                projectList.size(),
                0,
                0,
                0,
                0,
                0
        );
        return new DashboardCardOverview(
                stats,
                projectList,
                agentList,
                taskList.stream().limit(8).toList(),
                dashboardShortcutEntryService.getCurrentUserShortcutOverview()
        );
    }

    public PageResponse<ProjectSummary> pageProjects(int page, int size, String keyword, String status) {
        ProjectDataPermissionService.ProjectDataScope scope = projectDataPermissionService.requireCurrentScope();
        Pageable pageable = buildPageable(page, size, Sort.by(Sort.Direction.ASC, "id"));
        Page<ProjectSummary> pageData = projectRepository.findAll(projectSpecification(keyword, status, scope), pageable)
                .map(this::toProjectSummary);
        return PageResponse.from(pageData);
    }

    /**
     * 项目管理顶部统计卡片需要基于完整筛选结果聚合，不能再复用分页列表当前页的 records。
     */
    public ProjectListStatsSummary getProjectListStats(String keyword, String status) {
        ProjectDataPermissionService.ProjectDataScope scope = projectDataPermissionService.requireCurrentScope();
        List<ProjectEntity> projects = projectRepository.findAll(
                projectSpecification(keyword, status, scope),
                Sort.by(Sort.Direction.ASC, "id")
        );
        List<Long> projectIds = projects.stream()
                .map(ProjectEntity::getId)
                .toList();
        long totalTaskCount = projectIds.isEmpty()
                ? 0L
                : taskRepository.count((root, query, cb) -> root.get("project").get("id").in(projectIds));
        int activeProjectCount = projects.size();
        int runningProjectCount = (int) projects.stream()
                .filter(item -> "进行中".equals(item.getStatus()))
                .count();
        int resourceLoadPercent = activeProjectCount == 0
                ? 0
                : (int) Math.round((runningProjectCount * 100.0D) / activeProjectCount);
        double averageTaskCount = activeProjectCount == 0
                ? 0D
                : BigDecimal.valueOf(totalTaskCount)
                .divide(BigDecimal.valueOf(activeProjectCount), 1, RoundingMode.HALF_UP)
                .doubleValue();
        return new ProjectListStatsSummary(
                activeProjectCount,
                Math.toIntExact(totalTaskCount),
                resourceLoadPercent,
                averageTaskCount
        );
    }

    public List<ProjectSummary> listAllProjects() {
        ProjectDataPermissionService.ProjectDataScope scope = projectDataPermissionService.requireCurrentScope();
        return projectRepository.findAll(projectSpecification(null, null, scope), Sort.by(Sort.Direction.ASC, "id")).stream()
                .map(this::toProjectSummary)
                .toList();
    }

    public ProjectSummary getProject(Long id) {
        return toProjectSummary(requireProject(id));
    }

    public IterationBoardSummary getIterationBoard(Long projectId) {
        ProjectSummary project = toProjectSummary(requireProject(projectId));
        List<IterationSummary> iterations = iterationRepository.findAllByProject_IdOrderBySortOrderAscIdAsc(projectId)
                .stream()
                .map(this::toIterationSummary)
                .toList();
        return new IterationBoardSummary(
                project,
                Math.toIntExact(taskRepository.countByProject_IdAndIterationIsNull(projectId)),
                Math.toIntExact(taskRepository.countByProject_Id(projectId)),
                iterations
        );
    }

    public List<IterationSummary> listProjectIterations(Long projectId) {
        requireProject(projectId);
        return iterationRepository.findAllByProject_IdOrderBySortOrderAscIdAsc(projectId).stream()
                .map(this::toIterationSummary)
                .toList();
    }

    public ProjectBurndownSummary getProjectBurndown(Long projectId, Long iterationId, Boolean excludeUnplanned) {
        requireProject(projectId);
        boolean excludeUnplannedFlag = Boolean.TRUE.equals(excludeUnplanned);

        // 1) 确定时间窗 startDate / endDate ──
        //    若指定 iterationId，则使用该迭代的周期；否则使用所有迭代拼接的最早~最晚区间
        List<IterationEntity> iterations = iterationRepository.findAllByProject_IdOrderBySortOrderAscIdAsc(projectId);
        final IterationEntity selectedIteration = iterationId == null
                ? null
                : iterations.stream()
                        .filter(it -> iterationId.equals(it.getId()))
                        .findFirst()
                        .orElseThrow(() -> new IllegalArgumentException("迭代不存在或不属于该项目"));

        // 2) 加载任务并按筛选条件过滤 ──
        //    - 指定迭代：只取该迭代的工作项
        //    - 未指定迭代 + excludeUnplanned=true：剔除 iterationId 为空的工作项
        //    - 否则：项目下全部工作项
        List<TaskEntity> tasks = taskRepository.findAllByProject_IdOrderByUpdatedAtAscIdAsc(projectId).stream()
                .filter(task -> {
                    if (selectedIteration != null) {
                        return task.getIteration() != null
                                && selectedIteration.getId().equals(task.getIteration().getId());
                    }
                    if (excludeUnplannedFlag) {
                        return task.getIteration() != null;
                    }
                    return true;
                })
                .toList();

        LocalDate today = LocalDate.now();
        LocalDate startDate;
        LocalDate endDate;

        if (selectedIteration != null) {
            // 单个迭代：直接使用该迭代周期，缺失时回退
            startDate = selectedIteration.getStartDate();
            endDate = selectedIteration.getEndDate();
            if (startDate == null) {
                startDate = tasks.stream()
                        .map(TaskEntity::getUpdatedAt)
                        .filter(Objects::nonNull)
                        .map(LocalDateTime::toLocalDate)
                        .min(LocalDate::compareTo)
                        .orElse(today.minusDays(6));
            }
            if (endDate == null) {
                endDate = today;
            }
        } else {
            startDate = iterations.stream()
                    .map(IterationEntity::getStartDate)
                    .filter(Objects::nonNull)
                    .min(LocalDate::compareTo)
                    .orElseGet(() -> tasks.stream()
                            .map(TaskEntity::getUpdatedAt)
                            .filter(Objects::nonNull)
                            .map(LocalDateTime::toLocalDate)
                            .min(LocalDate::compareTo)
                            .orElse(today.minusDays(6)));

            endDate = iterations.stream()
                    .map(IterationEntity::getEndDate)
                    .filter(Objects::nonNull)
                    .max(LocalDate::compareTo)
                    .orElse(today);

            // 项目级视图强制延伸到今天；单迭代视图保留迭代真实结束日（不强制延伸）
            if (endDate.isBefore(today)) {
                endDate = today;
            }
        }

        if (ChronoUnit.DAYS.between(startDate, endDate) < 6) {
            startDate = endDate.minusDays(6);
        }
        if (startDate.isAfter(endDate)) {
            startDate = endDate.minusDays(6);
        }

        int totalCount = tasks.size();
        int completedCount = (int) tasks.stream().filter(task -> isCompletedStatus(task.getWorkItemType(), task.getStatus())).count();
        int remainingCount = Math.max(totalCount - completedCount, 0);

        Map<LocalDate, Integer> completedByDate = new HashMap<>();
        for (TaskEntity task : tasks) {
            if (!isCompletedStatus(task.getWorkItemType(), task.getStatus()) || task.getUpdatedAt() == null) {
                continue;
            }
            LocalDate completedDate = task.getUpdatedAt().toLocalDate();
            if (completedDate.isBefore(startDate)) {
                completedDate = startDate;
            }
            if (completedDate.isAfter(endDate)) {
                completedDate = endDate;
            }
            completedByDate.merge(completedDate, 1, Integer::sum);
        }

        List<String> labels = new ArrayList<>();
        List<Integer> idealRemaining = new ArrayList<>();
        List<Integer> actualRemaining = new ArrayList<>();

        long totalDays = Math.max(ChronoUnit.DAYS.between(startDate, endDate), 0);
        int cumulativeCompleted = 0;
        LocalDate cursor = startDate;
        while (!cursor.isAfter(endDate)) {
            labels.add(formatDate(cursor));
            long currentIndex = ChronoUnit.DAYS.between(startDate, cursor);
            int idealValue = totalDays == 0
                    ? 0
                    : (int) Math.max(Math.round(totalCount - (double) totalCount * currentIndex / totalDays), 0);
            cumulativeCompleted += completedByDate.getOrDefault(cursor, 0);
            idealRemaining.add(idealValue);
            actualRemaining.add(Math.max(totalCount - cumulativeCompleted, 0));
            cursor = cursor.plusDays(1);
        }

        return new ProjectBurndownSummary(
                formatDate(startDate),
                formatDate(endDate),
                totalCount,
                completedCount,
                remainingCount,
                labels,
                idealRemaining,
                actualRemaining
        );
    }

    /** 向后兼容入口（无筛选条件）：等价于全项目所有工作项的燃尽图。 */
    public ProjectBurndownSummary getProjectBurndown(Long projectId) {
        return getProjectBurndown(projectId, null, Boolean.FALSE);
    }

    @Transactional
    public IterationSummary createIteration(Long projectId, IterationRequest request) {
        ProjectEntity project = requireProject(projectId);
        UserEntity creatorUser = requireCurrentUser();
        IterationEntity entity = new IterationEntity();
        entity.setCreatorUser(creatorUser);
        fillIterationEntity(entity, project, request);
        IterationSummary summary = toIterationSummary(iterationRepository.save(entity));
        knowledgeGraphService.rebuildProjectGraph(projectId);
        return summary;
    }

    @Transactional
    public IterationSummary updateIteration(Long projectId, Long iterationId, IterationRequest request) {
        ProjectEntity project = requireProject(projectId);
        IterationEntity entity = requireIteration(projectId, iterationId);
        fillIterationEntity(entity, project, request);
        IterationSummary summary = toIterationSummary(iterationRepository.save(entity));
        knowledgeGraphService.rebuildProjectGraph(projectId);
        return summary;
    }

    @Transactional
    public void deleteIteration(Long projectId, Long iterationId) {
        IterationEntity entity = requireIteration(projectId, iterationId);
        projectDataPermissionService.requireIterationDeletable(entity);
        taskRepository.findAllByIteration_Id(iterationId).forEach(task -> task.setIteration(null));
        iterationRepository.delete(entity);
        knowledgeGraphService.rebuildProjectGraph(projectId);
    }

    @Transactional
    public ProjectSummary createProject(ProjectRequest request) {
        UserEntity creatorUser = requireCurrentUser();
        UserEntity ownerUser = request.ownerUserId() == null ? null : requireUser(request.ownerUserId());
        Set<UserEntity> members = mergeProjectMembersWithCreator(
                resolveAdditionalUsers(request.memberUserIds(), ownerUser == null ? null : ownerUser.getId()),
                ownerUser,
                creatorUser
        );
        ProjectEntity entity = new ProjectEntity(
                request.name(),
                buildOwner(request.owner(), ownerUser),
                request.status(),
                defaultString(request.description())
        );
        entity.setOwnerUser(ownerUser);
        entity.setCreatorUser(creatorUser);
        entity.setMembers(members);
        ProjectSummary summary = toProjectSummary(projectRepository.save(entity));
        knowledgeGraphService.rebuildProjectGraph(summary.id());
        return summary;
    }

    @Transactional
    public ProjectSummary updateProject(Long id, ProjectRequest request) {
        ProjectEntity entity = requireProject(id);
        projectDataPermissionService.requireProjectEditable(entity);
        UserEntity ownerUser = request.ownerUserId() == null ? null : requireUser(request.ownerUserId());
        Set<UserEntity> members = mergeProjectMembersWithCreator(
                resolveAdditionalUsers(request.memberUserIds(), ownerUser == null ? null : ownerUser.getId()),
                ownerUser,
                entity.getCreatorUser()
        );
        entity.setName(request.name());
        entity.setOwnerUser(ownerUser);
        entity.setMembers(members);
        entity.setOwner(buildOwner(request.owner(), ownerUser));
        entity.setStatus(request.status());
        entity.setDescription(defaultString(request.description()));
        ProjectSummary summary = toProjectSummary(projectRepository.save(entity));
        knowledgeGraphService.rebuildProjectGraph(id);
        return summary;
    }

    @Transactional
    public void deleteProject(Long id) {
        ProjectEntity entity = requireProject(id);
        projectDataPermissionService.requireProjectEditable(entity);
        projectRepository.delete(entity);
    }

    public PageResponse<AgentSummary> pageAgents(int page, int size, String keyword, String status,
                                                 String type, String accessType, Long projectId) {
        ProjectDataPermissionService.ProjectDataScope scope = projectDataPermissionService.requireCurrentScope();
        if (projectId != null) {
            requireProject(projectId);
        }
        Pageable pageable = buildPageable(page, size, Sort.by(Sort.Direction.ASC, "id"));
        Page<AgentSummary> pageData = agentRepository.findAll(agentSpecification(keyword, status, type, accessType, projectId, scope), pageable)
                .map(this::toAgentSummary);
        return PageResponse.from(pageData);
    }

    public List<AgentSummary> listAllAgents() {
        ProjectDataPermissionService.ProjectDataScope scope = projectDataPermissionService.requireCurrentScope();
        return agentRepository.findAll(agentSpecification(null, null, null, null, null, scope), Sort.by(Sort.Direction.ASC, "id")).stream()
                .map(this::toAgentSummary)
                .toList();
    }

    public List<AgentSummary> listEnabledAgents() {
        ProjectDataPermissionService.ProjectDataScope scope = projectDataPermissionService.requireCurrentScope();
        return agentRepository.findAll(agentSpecification(null, null, null, null, null, scope)
                        .and((root, query, cb) -> cb.isTrue(root.get("enabled"))),
                Sort.by(Sort.Direction.ASC, "id")).stream()
                .map(this::toAgentSummary)
                .toList();
    }

    public List<AgentSummary> listAgentsByProject(Long projectId) {
        requireProject(projectId);
        return agentRepository.findAllByProject_IdOrderByIdAsc(projectId).stream()
                .map(this::toAgentSummary)
                .toList();
    }

    public List<AgentSummary> listEnabledAgentsByProject(Long projectId) {
        requireProject(projectId);
        LinkedHashMap<Long, AgentSummary> result = new LinkedHashMap<>();
        agentRepository.findAllByEnabledTrueAndProjectIsNullOrderByIdAsc().stream()
                .map(this::toAgentSummary)
                .forEach(agent -> result.put(agent.id(), agent));
        agentRepository.findAllByProject_IdAndEnabledTrueOrderByIdAsc(projectId).stream()
                .map(this::toAgentSummary)
                .forEach(agent -> result.put(agent.id(), agent));
        return new ArrayList<>(result.values());
    }

    public AgentSummary getAgent(Long id) {
        return toAgentSummary(requireAgent(id));
    }

    @Transactional
    public AgentSummary createAgent(AgentRequest request) {
        ProjectEntity project = request.projectId() == null ? null : requireProject(request.projectId());
        AgentEntity entity = new AgentEntity(
                request.name(),
                request.type(),
                request.status(),
                defaultString(request.capability()),
                project
        );
        applyAgentRequest(entity, request, project, true);
        AgentSummary summary = toAgentSummary(agentRepository.save(entity));
        if (project != null) {
            knowledgeGraphService.rebuildProjectGraph(project.getId());
        }
        return summary;
    }

    @Transactional
    public AgentSummary updateAgent(Long id, AgentRequest request) {
        AgentEntity entity = requireAgent(id);
        Long previousProjectId = entity.getProject() == null ? null : entity.getProject().getId();
        ProjectEntity project = request.projectId() == null ? null : requireProject(request.projectId());
        applyAgentRequest(entity, request, project, false);
        AgentSummary summary = toAgentSummary(agentRepository.save(entity));

        LinkedHashSet<Long> affectedProjectIds = new LinkedHashSet<>();
        if (previousProjectId != null) {
            affectedProjectIds.add(previousProjectId);
        }
        if (project != null) {
            affectedProjectIds.add(project.getId());
        }
        taskRepository.findAllByAgent_Id(id).stream()
                .map(task -> task.getProject().getId())
                .forEach(affectedProjectIds::add);
        affectedProjectIds.forEach(knowledgeGraphService::rebuildProjectGraph);
        return summary;
    }

    @Transactional
    public void deleteAgent(Long id) {
        AgentEntity entity = requireAgent(id);
        List<TaskEntity> tasks = taskRepository.findAllByAgent_Id(entity.getId());
        LinkedHashSet<Long> affectedProjectIds = new LinkedHashSet<>();
        if (entity.getProject() != null) {
            affectedProjectIds.add(entity.getProject().getId());
        }
        tasks.forEach(task -> {
            task.setAgent(null);
            if (task.getAssigneeUser() == null) {
                task.setAssignee("未分配");
            }
            affectedProjectIds.add(task.getProject().getId());
        });
        agentRepository.delete(entity);
        affectedProjectIds.forEach(knowledgeGraphService::rebuildProjectGraph);
    }

    public PageResponse<TaskSummary> pageTasks(int page, int size, String keyword, String status,
                                               String priority, Long projectId, Long agentId) {
        ProjectDataPermissionService.ProjectDataScope scope = projectDataPermissionService.requireCurrentScope();
        if (projectId != null) {
            requireProject(projectId);
        }
        if (agentId != null) {
            requireAgent(agentId);
        }
        Pageable pageable = buildPageable(page, size, Sort.by(Sort.Direction.DESC, "id"));
        Page<TaskSummary> pageData = taskRepository.findAll(taskSpecification(keyword, status, priority, projectId, agentId, scope), pageable)
                .map(this::toTaskSummary);
        return PageResponse.from(pageData);
    }

    public List<TaskSummary> listAllTasks() {
        ProjectDataPermissionService.ProjectDataScope scope = projectDataPermissionService.requireCurrentScope();
        return taskRepository.findAll(taskSpecification(null, null, null, null, null, scope), Sort.by(Sort.Direction.DESC, "id")).stream()
                .map(this::toTaskSummary)
                .toList();
    }

    public TaskSummary getTask(Long id) {
        return toTaskSummary(requireTask(id));
    }

    public List<TaskCommentSummary> listTaskComments(Long taskId) {
        requireTask(taskId);
        return taskCommentRepository.findAllByTask_IdOrderByCreatedAtAscIdAsc(taskId).stream()
                .map(this::toTaskCommentSummary)
                .toList();
    }

    public List<TaskSummary> listProjectWorkItems(Long projectId, Long iterationId, Boolean unplanned, String workItemType, String keyword) {
        requireProject(projectId);
        if (iterationId != null) {
            requireIteration(projectId, iterationId);
        }
        return taskRepository.findAll(workItemSpecification(projectId, iterationId, unplanned, workItemType, keyword), Sort.by(Sort.Direction.DESC, "updatedAt", "id"))
                .stream()
                .map(this::toTaskSummary)
                .toList();
    }

    /**
     * 为迭代详情页返回“当前筛选结果”的全量统计，避免分页只覆盖当前页数据。
     */
    public ProjectWorkItemStatsSummary getProjectWorkItemStats(Long projectId,
                                                               Long iterationId,
                                                               Boolean unplanned,
                                                               String workItemType,
                                                               String keyword,
                                                               String status,
                                                               String priority,
                                                               Long assigneeUserId) {
        requireProject(projectId);
        if (iterationId != null) {
            requireIteration(projectId, iterationId);
        }
        List<TaskEntity> items = taskRepository.findAll(
                workItemPageSpecification(projectId, iterationId, unplanned, workItemType, keyword, status, priority, assigneeUserId),
                Sort.by(Sort.Direction.DESC, "updatedAt", "id")
        );
        return summarizeProjectWorkItems(items);
    }

    public PageResponse<TaskSummary> pageProjectWorkItems(Long projectId, int page, int size,
                                                          Long iterationId, Boolean unplanned, String workItemType, String keyword,
                                                          String status, String priority, Long assigneeUserId) {
        requireProject(projectId);
        if (iterationId != null) {
            requireIteration(projectId, iterationId);
        }
        Pageable pageable = buildPageable(page, size, Sort.by(Sort.Direction.DESC, "updatedAt", "id"));
        Page<TaskSummary> pageData = taskRepository.findAll(
                        workItemPageSpecification(projectId, iterationId, unplanned, workItemType, keyword, status, priority, assigneeUserId),
                        pageable
                )
                .map(this::toTaskSummary);
        return PageResponse.from(pageData);
    }

    @Transactional
    public TaskSummary createTask(TaskRequest request) {
        ProjectEntity project = requireProject(request.projectId());
        AgentEntity agent = request.agentId() == null ? null : requireAgent(request.agentId());
        IterationEntity iteration = request.iterationId() == null ? null : requireIteration(project.getId(), request.iterationId());
        String workItemType = normalizeWorkItemType(request.workItemType());
        String status = normalizeWorkItemStatus(workItemType, request.status());
        TaskEntity requirementTask = request.requirementTaskId() == null ? null : requireRequirementTask(project.getId(), request.requirementTaskId());
        UserEntity assigneeUser = request.assigneeUserId() == null ? null : requireUser(request.assigneeUserId());
        Set<UserEntity> collaborators = resolveAdditionalUsers(request.collaboratorUserIds(), assigneeUser == null ? null : assigneeUser.getId());
        RequirementDocumentPayload requirementDocument = buildRequirementDocument(workItemType, request, true);
        TaskPlanDateRange taskPlanDateRange = resolveTaskPlanDateRange(request.planStartDate(), request.planEndDate());
        String moduleName = normalizeModuleName(workItemType, request.moduleName());
        UserEntity creatorUser = requireCurrentUser();
        validateAgentProject(project.getId(), agent);
        validateRequirementRelation(workItemType, requirementTask);
        validateWorkItemStatus(workItemType, status);
        validateProjectParticipants(project, assigneeUser, collaborators);

        TaskEntity entity = new TaskEntity(
                request.name(),
                workItemType,
                status,
                request.priority(),
                buildAssignee(request.assignee(), assigneeUser),
                requirementDocument.description(),
                project,
                agent,
                iteration
        );
        entity.setWorkItemCode(generateUniqueWorkItemCode());
        entity.setCreatorUser(creatorUser);
        entity.setAssigneeUser(assigneeUser);
        entity.setCollaborators(collaborators);
        entity.setRequirementTask(requirementTask);
        entity.setRequirementMarkdown(requirementDocument.requirementMarkdown());
        entity.setPrototypeUrl(requirementDocument.prototypeUrl());
        entity.setModuleName(moduleName);
        entity.setDevPassed(false);
        entity.setTestPassed(false);
        entity.setWorkHours(normalizeWorkHours(workItemType, request.workHours()));
        entity.setPlanStartDate(taskPlanDateRange.planStartDate());
        entity.setPlanEndDate(taskPlanDateRange.planEndDate());
        syncOverdueNotificationState(entity);
        TaskEntity saved = taskRepository.save(entity);
        requirementModuleOptionService.ensureCustomRequirementModule(project, workItemType, moduleName);
        if ("需求".equals(workItemType)) {
            taskPrdService.initializeIfEligible(saved.getId());
        }
        taskNotificationService.notifyTaskCreated(saved, assigneeUser, collaborators);
        TaskSummary summary = toTaskSummary(saved);
        knowledgeGraphService.rebuildProjectGraph(project.getId());
        return summary;
    }

    @Transactional
    public TaskCommentSummary createTaskComment(Long taskId, TaskCommentRequest request) {
        TaskEntity task = requireTask(taskId);
        UserEntity author = requireCurrentUser();
        String content = defaultString(request.content()).trim();
        if (!RichTextUtils.hasRenderableContent(content)) {
            throw new IllegalArgumentException("评论内容不能为空");
        }

        TaskCommentEntity entity = new TaskCommentEntity();
        entity.setTask(task);
        entity.setAuthorUser(author);
        entity.setAuthorName(displayName(author));
        entity.setContent(content);

        TaskCommentEntity saved = taskCommentRepository.save(entity);
        task.setUpdatedAt(LocalDateTime.now());
        taskRepository.save(task);
        taskNotificationService.notifyTaskCommentCreated(task, author, saved);
        return toTaskCommentSummary(saved);
    }

    @Transactional
    public TaskSummary updateTask(Long id, TaskRequest request) {
        TaskEntity entity = requireTask(id);
        Long previousAssigneeUserId = entity.getAssigneeUser() == null ? null : entity.getAssigneeUser().getId();
        Long previousProjectId = entity.getProject() == null ? null : entity.getProject().getId();
        String previousWorkItemType = normalizeWorkItemType(entity.getWorkItemType());
        String previousModuleName = normalizeModuleName(previousWorkItemType, entity.getModuleName());
        String previousStatus = entity.getStatus();
        Set<Long> previousCollaboratorUserIds = entity.getCollaborators().stream().map(UserEntity::getId).collect(LinkedHashSet::new, LinkedHashSet::add, LinkedHashSet::addAll);
        ProjectEntity project = requireProject(request.projectId());
        AgentEntity agent = request.agentId() == null ? null : requireAgent(request.agentId());
        IterationEntity iteration = request.iterationId() == null ? null : requireIteration(project.getId(), request.iterationId());
        String workItemType = normalizeWorkItemType(request.workItemType());
        String status = normalizeWorkItemStatus(workItemType, request.status());
        TaskEntity requirementTask = request.requirementTaskId() == null ? null : requireRequirementTask(project.getId(), request.requirementTaskId());
        UserEntity assigneeUser = request.assigneeUserId() == null ? null : requireUser(request.assigneeUserId());
        Set<UserEntity> collaborators = resolveAdditionalUsers(request.collaboratorUserIds(), assigneeUser == null ? null : assigneeUser.getId());
        RequirementDocumentPayload requirementDocument = buildRequirementDocument(workItemType, request, false);
        TaskPlanDateRange taskPlanDateRange = resolveTaskPlanDateRange(request.planStartDate(), request.planEndDate());
        String moduleName = normalizeModuleName(workItemType, request.moduleName());
        validateAgentProject(project.getId(), agent);
        validateRequirementRelation(workItemType, requirementTask);
        validateWorkItemStatus(workItemType, status);
        validateProjectParticipants(project, assigneeUser, collaborators);

        entity.setName(request.name());
        entity.setWorkItemType(workItemType);
        entity.setStatus(status);
        entity.setPriority(request.priority());
        entity.setDescription(requirementDocument.description());
        entity.setProject(project);
        entity.setAgent(agent);
        entity.setIteration(iteration);
        entity.setRequirementTask(requirementTask);
        entity.setAssigneeUser(assigneeUser);
        entity.setCollaborators(collaborators);
        entity.setAssignee(buildAssignee(request.assignee(), assigneeUser));
        entity.setRequirementMarkdown(requirementDocument.requirementMarkdown());
        entity.setPrototypeUrl(requirementDocument.prototypeUrl());
        entity.setModuleName(moduleName);
        if (!"需求".equals(workItemType)) {
            entity.setDevPassed(false);
            entity.setTestPassed(false);
        }
        entity.setWorkHours(normalizeWorkHours(workItemType, request.workHours()));
        entity.setPlanStartDate(taskPlanDateRange.planStartDate());
        entity.setPlanEndDate(taskPlanDateRange.planEndDate());
        syncOverdueNotificationState(entity);

        TaskEntity saved = taskRepository.save(entity);
        syncRequirementModuleOptionOnUpdate(project, previousProjectId, previousWorkItemType, previousModuleName, workItemType, moduleName);
        taskNotificationService.notifyTaskUpdated(saved, previousAssigneeUserId, previousStatus, previousCollaboratorUserIds);
        TaskSummary summary = toTaskSummary(saved);
        knowledgeGraphService.rebuildProjectGraph(project.getId());
        return summary;
    }


    @Transactional
    public void deleteTask(Long id) {
        TaskEntity entity = requireTask(id);
        projectDataPermissionService.requireTaskDeletable(entity);
        Long projectId = entity.getProject().getId();
        taskRepository.delete(entity);
        knowledgeGraphService.rebuildProjectGraph(projectId);
    }

    private Pageable buildPageable(int page, int size, Sort sort) {
        int safePage = Math.max(page, 1);
        int safeSize = Math.max(1, Math.min(size, 100));
        return PageRequest.of(safePage - 1, safeSize, sort);
    }

    private Specification<ProjectEntity> projectSpecification(String keyword, String status,
                                                              ProjectDataPermissionService.ProjectDataScope scope) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            appendProjectVisibilityPredicate(predicates, root, query, cb, scope);
            if (hasText(keyword)) {
                String pattern = "%" + keyword.trim().toLowerCase() + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("name")), pattern),
                        cb.like(cb.lower(root.get("owner")), pattern),
                        cb.like(cb.lower(root.get("description")), pattern)
                ));
            }
            if (hasText(status)) {
                predicates.add(cb.equal(root.get("status"), status.trim()));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    private Specification<AgentEntity> agentSpecification(String keyword, String status, String type,
                                                          String accessType, Long projectId,
                                                          ProjectDataPermissionService.ProjectDataScope scope) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            appendAgentVisibilityPredicate(predicates, root, query, cb, scope);
            if (hasText(keyword)) {
                String pattern = "%" + keyword.trim().toLowerCase() + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("name")), pattern),
                        cb.like(cb.lower(root.get("capability")), pattern)
                ));
            }
            if (hasText(status)) {
                predicates.add(cb.equal(root.get("status"), status.trim()));
            }
            if (hasText(type)) {
                predicates.add(cb.equal(root.get("type"), type.trim()));
            }
            if (hasText(accessType)) {
                predicates.add(cb.equal(root.get("accessType"), accessType.trim().toUpperCase()));
            }
            if (projectId != null) {
                predicates.add(cb.equal(root.get("project").get("id"), projectId));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    private Specification<TaskEntity> taskSpecification(String keyword, String status, String priority,
                                                        Long projectId, Long agentId,
                                                        ProjectDataPermissionService.ProjectDataScope scope) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            appendProjectVisibilityPredicate(predicates, root.join("project", JoinType.INNER), query, cb, scope);
            if (hasText(keyword)) {
                String pattern = "%" + keyword.trim().toLowerCase() + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("name")), pattern),
                        cb.like(cb.lower(root.get("description")), pattern),
                        cb.like(cb.lower(root.get("assignee")), pattern),
                        cb.like(cb.lower(root.get("project").get("name")), pattern)
                ));
            }
            if (hasText(status)) {
                predicates.add(root.get("status").in(TaskStatusUtils.candidateStatusesForQuery(null, status)));
            }
            if (hasText(priority)) {
                predicates.add(cb.equal(root.get("priority"), priority.trim()));
            }
            if (projectId != null) {
                predicates.add(cb.equal(root.get("project").get("id"), projectId));
            }
            if (agentId != null) {
                predicates.add(cb.equal(root.get("agent").get("id"), agentId));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    private Specification<TaskEntity> workItemSpecification(Long projectId, Long iterationId, Boolean unplanned,
                                                             String workItemType, String keyword) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            appendProjectVisibilityPredicate(predicates, root.join("project", JoinType.INNER), query, cb,
                    projectDataPermissionService.requireCurrentScope());
            predicates.add(cb.equal(root.get("project").get("id"), projectId));
            if (Boolean.TRUE.equals(unplanned)) {
                predicates.add(cb.isNull(root.get("iteration")));
            } else if (iterationId != null) {
                predicates.add(cb.equal(root.get("iteration").get("id"), iterationId));
            }
            if (hasText(workItemType) && !"全部".equalsIgnoreCase(workItemType.trim()) && !"所有".equalsIgnoreCase(workItemType.trim())) {
                predicates.add(cb.equal(root.get("workItemType"), normalizeWorkItemType(workItemType)));
            }
            if (hasText(keyword)) {
                String pattern = "%" + keyword.trim().toLowerCase() + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("name")), pattern),
                        cb.like(cb.lower(root.get("description")), pattern),
                        cb.like(cb.lower(root.get("assignee")), pattern)
                ));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    private Specification<TaskEntity> workItemPageSpecification(Long projectId, Long iterationId, Boolean unplanned,
                                                                 String workItemType, String keyword, String status,
                                                                 String priority, Long assigneeUserId) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            appendProjectVisibilityPredicate(predicates, root.join("project", JoinType.INNER), query, cb,
                    projectDataPermissionService.requireCurrentScope());
            predicates.add(cb.equal(root.get("project").get("id"), projectId));
            if (Boolean.TRUE.equals(unplanned)) {
                predicates.add(cb.isNull(root.get("iteration")));
            } else if (iterationId != null) {
                predicates.add(cb.equal(root.get("iteration").get("id"), iterationId));
            }
            if (hasText(workItemType) && !"全部".equalsIgnoreCase(workItemType.trim()) && !"所有".equalsIgnoreCase(workItemType.trim())) {
                predicates.add(cb.equal(root.get("workItemType"), normalizeWorkItemType(workItemType)));
            }
            if (hasText(keyword)) {
                String pattern = "%" + keyword.trim().toLowerCase() + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("name")), pattern),
                        cb.like(cb.lower(root.get("description")), pattern),
                        cb.like(cb.lower(root.get("assignee")), pattern)
                ));
            }
            if (hasText(status)) {
                predicates.add(cb.equal(root.get("status"), status.trim()));
            }
            if (hasText(priority)) {
                predicates.add(cb.equal(root.get("priority"), priority.trim()));
            }
            if (assigneeUserId != null) {
                predicates.add(cb.equal(root.get("assigneeUser").get("id"), assigneeUserId));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    private void fillIterationEntity(IterationEntity entity, ProjectEntity project, IterationRequest request) {
        LocalDate startDate = parseDate(request.startDate(), "开始日期");
        LocalDate endDate = parseDate(request.endDate(), "结束日期");
        if (startDate != null && endDate != null && endDate.isBefore(startDate)) {
            throw new IllegalArgumentException("结束日期不能早于开始日期");
        }
        entity.setProject(project);
        entity.setName(request.name().trim());
        entity.setGoal(defaultString(request.goal()));
        entity.setStatus(request.status().trim());
        entity.setStartDate(startDate);
        entity.setEndDate(endDate);
        entity.setDescription(defaultString(request.description()));
        entity.setSortOrder(request.sortOrder() == null ? 0 : request.sortOrder());
    }

    private void validateAgentProject(Long projectId, AgentEntity agent) {
        if (agent != null && agent.getProject() != null && !projectId.equals(agent.getProject().getId())) {
            throw new IllegalArgumentException("所选 Agent 不属于当前项目");
        }
    }

    /**
     * 校验负责人和协作人均属于当前项目参与人范围，避免任务指派给无权限查看项目的用户。
     */
    private void validateProjectParticipants(ProjectEntity project, UserEntity assigneeUser, Set<UserEntity> collaborators) {
        projectDataPermissionService.requireProjectParticipant(project, assigneeUser, "负责人");
        for (UserEntity collaborator : collaborators) {
            projectDataPermissionService.requireProjectParticipant(project, collaborator, "协作人");
        }
    }

    private void applyAgentRequest(AgentEntity entity, AgentRequest request, ProjectEntity project, boolean createMode) {
        entity.setName(request.name().trim());
        entity.setType(request.type().trim());
        entity.setStatus(request.status().trim());
        entity.setCapability(defaultString(request.capability()));
        entity.setDescription(defaultString(request.description()));
        entity.setEnabled(request.enabled() == null || request.enabled());
        entity.setProject(project);

        String accessType = normalizeConfiguredAgentAccessType(request.accessType());
        entity.setAccessType(accessType);
        entity.setBuiltinCode(AgentExecutionService.ACCESS_BUILT_IN.equals(accessType) ? trimToNull(request.builtinCode()) : null);
        entity.setAiModelConfig((AgentExecutionService.ACCESS_BUILT_IN.equals(accessType) || AgentExecutionService.ACCESS_LLM_PROMPT.equals(accessType))
                && request.aiModelConfigId() != null ? requireChatModelConfig(request.aiModelConfigId()) : null);
        entity.setSystemPrompt(trimToNull(request.systemPrompt()));
        entity.setUserPromptTemplate((AgentExecutionService.ACCESS_LLM_PROMPT.equals(accessType) || AgentExecutionService.ACCESS_AGENT_RUNTIME.equals(accessType))
                ? trimToNull(request.userPromptTemplate()) : null);

        if (AgentExecutionService.ACCESS_AGENT_RUNTIME.equals(accessType)) {
            String runtimeType = normalizeConfiguredRuntimeType(request.runtimeType());
            entity.setRuntimeType(runtimeType);
            entity.setHttpMethod("POST");
            entity.setHttpHeaders(null);
            entity.setHttpRequestTemplate(null);
            entity.setHttpResponsePath(null);
            entity.setTimeoutSeconds(resolveConfiguredTimeoutSeconds(request.timeoutSeconds()));
            if (AgentExecutionService.RUNTIME_OPENCLAW.equals(runtimeType)) {
                entity.setEndpointUrl(trimToNull(request.endpointUrl()));
                entity.setRuntimeAgentRef(trimToNull(request.runtimeAgentRef()));
                entity.setRuntimeSessionKeyTemplate(trimToNull(request.runtimeSessionKeyTemplate()));
                entity.setHttpAuthType(normalizeHttpAuthType(request.httpAuthType()));
                updateAgentAuthToken(entity, request.httpAuthToken(), createMode);
            } else {
                // CLI Runtime 统一走平台级 code-processing 地址和内部服务 Token，
                // Agent 级别不再保留 gateway / session key / bearer token 之类的重复配置。
                entity.setEndpointUrl(null);
                entity.setRuntimeAgentRef(null);
                entity.setRuntimeSessionKeyTemplate(null);
                entity.setHttpAuthType(null);
                entity.setHttpAuthTokenCiphertext(null);
            }
        } else if (AgentExecutionService.ACCESS_HTTP_API.equals(accessType)) {
            entity.setRuntimeType(null);
            entity.setRuntimeAgentRef(null);
            entity.setRuntimeSessionKeyTemplate(null);
            entity.setEndpointUrl(trimToNull(request.endpointUrl()));
            entity.setHttpMethod(normalizeHttpMethod(request.httpMethod()));
            entity.setHttpHeaders(trimToNull(request.httpHeaders()));
            entity.setHttpAuthType(normalizeHttpAuthType(request.httpAuthType()));
            updateAgentAuthToken(entity, request.httpAuthToken(), createMode);
            entity.setHttpRequestTemplate(trimToNull(request.httpRequestTemplate()));
            entity.setHttpResponsePath(trimToNull(request.httpResponsePath()));
            entity.setTimeoutSeconds(resolveConfiguredTimeoutSeconds(request.timeoutSeconds()));
        } else {
            entity.setRuntimeType(null);
            entity.setRuntimeAgentRef(null);
            entity.setRuntimeSessionKeyTemplate(null);
            entity.setEndpointUrl(null);
            entity.setHttpMethod(null);
            entity.setHttpHeaders(null);
            entity.setHttpAuthType(null);
            entity.setHttpAuthTokenCiphertext(null);
            entity.setHttpRequestTemplate(null);
            entity.setHttpResponsePath(null);
            entity.setTimeoutSeconds(60);
        }

        if ((AgentExecutionService.ACCESS_BUILT_IN.equals(accessType) || AgentExecutionService.ACCESS_LLM_PROMPT.equals(accessType))
                && entity.getAiModelConfig() == null) {
            throw new IllegalArgumentException("当前 Agent 需要绑定模型配置");
        }
        if (AgentExecutionService.ACCESS_BUILT_IN.equals(accessType) && !hasText(entity.getBuiltinCode())) {
            throw new IllegalArgumentException("当前内置 Agent 必须选择内置能力");
        }
        if (AgentExecutionService.ACCESS_LLM_PROMPT.equals(accessType) && !hasText(entity.getUserPromptTemplate())) {
            throw new IllegalArgumentException("提示词 Agent 必须填写用户提示词模板");
        }
        if (AgentExecutionService.ACCESS_HTTP_API.equals(accessType) && !hasText(entity.getEndpointUrl())) {
            throw new IllegalArgumentException("HTTP API Agent 必须填写接口地址");
        }
        if (AgentExecutionService.ACCESS_AGENT_RUNTIME.equals(accessType)) {
            if (!hasText(entity.getRuntimeType())) {
                throw new IllegalArgumentException("Agent Runtime 必须选择 Runtime 类型");
            }
            if (AgentExecutionService.RUNTIME_OPENCLAW.equals(entity.getRuntimeType())
                    && !hasText(entity.getEndpointUrl())) {
                throw new IllegalArgumentException("OpenClaw Runtime 必须填写 Gateway 地址");
            }
            if (AgentExecutionService.RUNTIME_OPENCLAW.equals(entity.getRuntimeType())
                    && !hasText(entity.getRuntimeAgentRef())) {
                throw new IllegalArgumentException("OpenClaw Runtime 必须填写 Runtime Agent 标识");
            }
        }
    }

    private String normalizeConfiguredAgentAccessType(String accessType) {
        String value = hasText(accessType) ? accessType.trim().toUpperCase() : AgentExecutionService.ACCESS_BUILT_IN;
        if (!AgentExecutionService.ACCESS_BUILT_IN.equals(value)
                && !AgentExecutionService.ACCESS_LLM_PROMPT.equals(value)
                && !AgentExecutionService.ACCESS_HTTP_API.equals(value)
                && !AgentExecutionService.ACCESS_AGENT_RUNTIME.equals(value)) {
            throw new IllegalArgumentException("Agent 接入方式仅支持 BUILT_IN、LLM_PROMPT、HTTP_API、AGENT_RUNTIME");
        }
        return value;
    }

    private String normalizeConfiguredRuntimeType(String runtimeType) {
        String value = trimToNull(runtimeType);
        if (value == null) {
            return null;
        }
        value = value.toUpperCase();
        if (!AgentExecutionService.RUNTIME_OPENCLAW.equals(value)
                && !AgentExecutionService.RUNTIME_CODEX_CLI.equals(value)
                && !AgentExecutionService.RUNTIME_CLAUDE_CODE_CLI.equals(value)) {
            throw new IllegalArgumentException("当前仅支持 OPENCLAW、CODEX_CLI、CLAUDE_CODE_CLI Runtime");
        }
        return value;
    }

    private int resolveConfiguredTimeoutSeconds(Integer timeoutSeconds) {
        return timeoutSeconds == null ? 60 : Math.max(5, Math.min(timeoutSeconds, 300));
    }

    private void updateAgentAuthToken(AgentEntity entity, String httpAuthToken, boolean createMode) {
        if (hasText(httpAuthToken)) {
            entity.setHttpAuthTokenCiphertext(tokenCipherService.encrypt(httpAuthToken.trim()));
        } else if (createMode) {
            entity.setHttpAuthTokenCiphertext(null);
        }
    }

    private String buildOwner(String owner, UserEntity ownerUser) {
        if (ownerUser != null) {
            return displayName(ownerUser);
        }
        String value = defaultString(owner).trim();
        if (value.isBlank()) {
            throw new IllegalArgumentException("负责人不能为空");
        }
        return value;
    }

    private String buildAssignee(String assignee, UserEntity assigneeUser) {
        if (assigneeUser != null) {
            return displayName(assigneeUser);
        }
        String value = defaultString(assignee).trim();
        return value.isBlank() ? "未分配" : value;
    }

    private Set<UserEntity> resolveAdditionalUsers(List<Long> userIds, Long excludedUserId) {
        if (userIds == null || userIds.isEmpty()) {
            return new LinkedHashSet<>();
        }

        LinkedHashMap<Long, Long> distinctIds = new LinkedHashMap<>();
        for (Long userId : userIds) {
            if (userId == null) {
                continue;
            }
            if (excludedUserId != null && excludedUserId.equals(userId)) {
                continue;
            }
            distinctIds.putIfAbsent(userId, userId);
        }
        if (distinctIds.isEmpty()) {
            return new LinkedHashSet<>();
        }

        Map<Long, UserEntity> userMap = new LinkedHashMap<>();
        for (UserEntity user : userRepository.findAllById(distinctIds.keySet())) {
            userMap.put(user.getId(), user);
        }

        LinkedHashSet<UserEntity> result = new LinkedHashSet<>();
        for (Long userId : distinctIds.keySet()) {
            UserEntity user = userMap.get(userId);
            if (user == null) {
                throw new NoSuchElementException("用户不存在: " + userId);
            }
            result.add(user);
        }
        return result;
    }

    /**
     * 创建人需要默认具备项目成员可见性，这里统一补齐并防止后续编辑时被误移除。
     */
    private Set<UserEntity> mergeProjectMembersWithCreator(Set<UserEntity> members, UserEntity ownerUser, UserEntity creatorUser) {
        LinkedHashSet<UserEntity> result = new LinkedHashSet<>(members);
        if (creatorUser != null && (ownerUser == null || !creatorUser.getId().equals(ownerUser.getId()))) {
            result.add(creatorUser);
        }
        return result;
    }

    /**
     * 为项目实体查询追加项目数据可见范围条件。
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

    /**
     * Agent 允许无项目归属的全局配置继续可见，项目级 Agent 则受项目范围约束。
     */
    private void appendAgentVisibilityPredicate(List<Predicate> predicates,
                                                jakarta.persistence.criteria.Root<AgentEntity> root,
                                                jakarta.persistence.criteria.CriteriaQuery<?> query,
                                                jakarta.persistence.criteria.CriteriaBuilder cb,
                                                ProjectDataPermissionService.ProjectDataScope scope) {
        if (scope.superAdmin()) {
            return;
        }
        DataPermissionScopeType visibilityScope = scope.policy().projectVisibilityScope();
        From<?, ProjectEntity> projectRoot = root.join("project", JoinType.LEFT);
        switch (visibilityScope) {
            case ALL -> {
                return;
            }
            case NONE -> predicates.add(cb.isNull(root.get("project")));
            case OWNER_ONLY -> predicates.add(cb.or(
                    cb.isNull(root.get("project")),
                    cb.equal(projectRoot.join("ownerUser", JoinType.LEFT).get("id"), scope.userId())
            ));
            case CREATOR_ONLY -> predicates.add(cb.or(
                    cb.isNull(root.get("project")),
                    cb.equal(projectRoot.join("creatorUser", JoinType.LEFT).get("id"), scope.userId())
            ));
            case OWNER_OR_CREATOR -> predicates.add(cb.or(
                    cb.isNull(root.get("project")),
                    cb.equal(projectRoot.join("ownerUser", JoinType.LEFT).get("id"), scope.userId()),
                    cb.equal(projectRoot.join("creatorUser", JoinType.LEFT).get("id"), scope.userId())
            ));
            case PROJECT_PARTICIPANT -> {
                query.distinct(true);
                predicates.add(cb.or(
                        cb.isNull(root.get("project")),
                        cb.equal(projectRoot.join("ownerUser", JoinType.LEFT).get("id"), scope.userId()),
                        cb.equal(projectRoot.join("creatorUser", JoinType.LEFT).get("id"), scope.userId()),
                        cb.equal(projectRoot.join("members", JoinType.LEFT).get("id"), scope.userId())
                ));
            }
        }
    }

    private ProjectEntity requireProject(Long id) {
        ProjectEntity project = projectRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("项目不存在: " + id));
        projectDataPermissionService.requireProjectVisible(project);
        return project;
    }

    private AgentEntity requireAgent(Long id) {
        AgentEntity agent = agentRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Agent 不存在: " + id));
        projectDataPermissionService.requireAgentVisible(agent);
        return agent;
    }

    /**
     * Agent 文本生成链路只允许绑定对话模型，避免 Embedding 模型被误用到执行阶段。
     */
    private AiModelConfigEntity requireChatModelConfig(Long id) {
        AiModelConfigEntity modelConfig = aiModelConfigRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("模型配置不存在: " + id));
        if (!ModelConfigService.MODEL_TYPE_CHAT.equalsIgnoreCase(defaultString(modelConfig.getModelType()).trim())) {
            throw new IllegalArgumentException("当前 Agent 仅支持绑定对话模型配置");
        }
        return modelConfig;
    }

    private UserEntity requireUser(Long id) {
        return userRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("用户不存在: " + id));
    }

    private UserEntity requireCurrentUser() {
        Long userId = AuthContextHolder.get()
                .map(authContext -> authContext.userId())
                .orElseThrow(() -> new UnauthorizedException("Not logged in"));
        return requireUser(userId);
    }

    private TaskEntity requireTask(Long id) {
        TaskEntity task = taskRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("任务不存在: " + id));
        projectDataPermissionService.requireTaskVisible(task);
        return task;
    }

    private IterationEntity requireIteration(Long projectId, Long iterationId) {
        IterationEntity iteration = iterationRepository.findByIdAndProject_Id(iterationId, projectId)
                .orElseThrow(() -> new NoSuchElementException("迭代不存在: " + iterationId));
        projectDataPermissionService.requireIterationVisible(iteration);
        return iteration;
    }

    private TaskEntity requireRequirementTask(Long projectId, Long requirementTaskId) {
        TaskEntity task = requireTask(requirementTaskId);
        if (!task.getProject().getId().equals(projectId)) {
            throw new IllegalArgumentException("关联需求必须属于当前项目");
        }
        if (!"需求".equals(defaultString(task.getWorkItemType()).trim())) {
            throw new IllegalArgumentException("仅可关联需求类型工作项");
        }
        return task;
    }

    /**
     * 按工作项编号获取需求工作项。
     */
    private TaskEntity requireRequirementTask(Long taskId) {
        TaskEntity task = requireTask(taskId);
        if (!"需求".equals(defaultString(task.getWorkItemType()).trim())) {
            throw new IllegalArgumentException("仅需求类型工作项支持该操作");
        }
        return task;
    }

    private void validateRequirementRelation(String workItemType, TaskEntity requirementTask) {
        if ("需求".equals(workItemType) && requirementTask != null) {
            throw new IllegalArgumentException("需求类型工作项不能再关联其他需求");
        }
    }

    /**
     * 工作项主状态由类型驱动，避免需求、任务、缺陷混用彼此的状态集。
     */
    private void validateWorkItemStatus(String workItemType, String status) {
        if (!TaskStatusUtils.isValidStatus(workItemType, status)) {
            throw new IllegalArgumentException(workItemType + "状态仅支持：" + TaskStatusUtils.describeAllowedStatuses(workItemType));
        }
    }

    /**
     * 根据工作项类型构建需求模板载荷，并同步兼容描述字段。
     */
    private RequirementDocumentPayload buildRequirementDocument(String workItemType, TaskRequest request, boolean createMode) {
        if (!"需求".equals(workItemType)) {
            return new RequirementDocumentPayload("", "", defaultString(request.description()));
        }

        String prototypeUrl = trimToNull(request.prototypeUrl());
        String sourceMarkdown = hasText(request.requirementMarkdown())
                ? request.requirementMarkdown()
                : request.description();
        String requirementMarkdown = RequirementDocumentUtils.normalizeSystemTemplateHeadings(sourceMarkdown);
        // 原型链接改为选填字段，需求提交阶段仅校验模板章节完整性，不再因缺少链接阻塞保存。
        boolean draftRequirement = "草稿".equals(defaultString(request.status()).trim());
        if (draftRequirement) {
            if (requirementMarkdown.isBlank()) {
                requirementMarkdown = RequirementDocumentUtils.defaultTemplate();
            }
        } else {
            RequirementDocumentUtils.validateForSubmit(requirementMarkdown);
        }

        return new RequirementDocumentPayload(
                requirementMarkdown,
                prototypeUrl == null ? "" : prototypeUrl,
                requirementMarkdown
        );
    }


    /**
     * 标准化任务工时。仅任务类型允许设置工时，其他工作项统一清空。
     */
    private BigDecimal normalizeWorkHours(String workItemType, BigDecimal workHours) {
        if (!"任务".equals(workItemType) || workHours == null) {
            return null;
        }
        BigDecimal normalized = workHours.setScale(1, RoundingMode.HALF_UP);
        if (normalized.compareTo(new BigDecimal("15.0")) > 0) {
            throw new IllegalArgumentException("工时不能超过15小时");
        }
        if (normalized.compareTo(BigDecimal.ZERO) < 0) {
            throw new IllegalArgumentException("工时不能小于0");
        }
        return normalized.stripTrailingZeros();
    }

    /**
     * 统一解析工作项计划时间，并在开始和结束同时存在时校验时间先后关系。
     */
    private TaskPlanDateRange resolveTaskPlanDateRange(String planStartDate, String planEndDate) {
        LocalDate startDate = parseDate(planStartDate, "计划开始日期");
        LocalDate endDate = parseDate(planEndDate, "计划结束日期");
        if (startDate != null && endDate != null && endDate.isBefore(startDate)) {
            throw new IllegalArgumentException("计划结束日期不能早于计划开始日期");
        }
        return new TaskPlanDateRange(startDate, endDate);
    }

    /**
     * 工作项编号只允许后端生成，这里通过“生成后查重”的方式确保编号唯一。
     */
    private String generateUniqueWorkItemCode() {
        for (int attempt = 0; attempt < 200; attempt++) {
            String nextCode = buildRandomWorkItemCode();
            if (!taskRepository.existsByWorkItemCode(nextCode)) {
                return nextCode;
            }
        }
        throw new IllegalStateException("工作项编号生成失败，请稍后重试");
    }

    /**
     * 构造 # + 6 位随机大写字母数字的工作项编号。
     */
    private String buildRandomWorkItemCode() {
        StringBuilder builder = new StringBuilder(WORK_ITEM_CODE_PREFIX);
        for (int index = 0; index < WORK_ITEM_CODE_RANDOM_LENGTH; index++) {
            int randomIndex = workItemCodeRandom.nextInt(WORK_ITEM_CODE_CHARS.length());
            builder.append(WORK_ITEM_CODE_CHARS.charAt(randomIndex));
        }
        return builder.toString();
    }


    /**
     * 统计摘要统一复用类型化完成态定义，供迭代详情顶部卡片直接消费。
     */
    private ProjectWorkItemStatsSummary summarizeProjectWorkItems(List<TaskEntity> items) {
        int totalCount = items.size();
        int completedCount = (int) items.stream()
                .filter(item -> isCompletedStatus(item.getWorkItemType(), item.getStatus()))
                .count();
        int defectCount = (int) items.stream()
                .filter(item -> TaskStatusUtils.WORK_ITEM_TYPE_DEFECT.equals(normalizeWorkItemType(item.getWorkItemType())))
                .count();
        int openCount = Math.max(totalCount - completedCount, 0);
        int completionRate = totalCount == 0 ? 0 : (int) Math.round((completedCount * 100.0) / totalCount);
        return new ProjectWorkItemStatsSummary(
                totalCount,
                completedCount,
                openCount,
                defectCount,
                completionRate
        );
    }

    private ProjectSummary toProjectSummary(ProjectEntity entity) {
        int agentCount = (int) agentRepository.countByProject_Id(entity.getId());
        int taskCount = (int) taskRepository.countByProject_Id(entity.getId());
        List<UserEntity> members = entity.getMembers().stream()
                .sorted((a, b) -> Long.compare(a.getId(), b.getId()))
                .toList();
        // 项目列表需要直接消费负责人头像与成员轻量信息，避免前端额外发请求拼装展示数据。
        List<ProjectMemberSummary> memberItems = members.stream()
                .map(this::toProjectMemberSummary)
                .toList();
        return new ProjectSummary(
                entity.getId(),
                entity.getName(),
                entity.getOwner(),
                entity.getOwnerUser() == null ? null : entity.getOwnerUser().getId(),
                entity.getCreatorUser() == null ? null : entity.getCreatorUser().getId(),
                entity.getOwnerUser() == null ? null : trimToNull(entity.getOwnerUser().getAvatarUrl()),
                members.stream().map(UserEntity::getId).toList(),
                members.stream().map(this::displayName).toList(),
                memberItems,
                entity.getStatus(),
                entity.getDescription(),
                agentCount,
                taskCount,
                Math.toIntExact(projectGitlabBindingRepository.countByProject_Id(entity.getId())),
                canEditProject(entity),
                canEditProject(entity)
        );
    }

    /**
     * 构建项目成员轻量摘要，供前端项目列表头像与弹层详情复用。
     */
    private ProjectMemberSummary toProjectMemberSummary(UserEntity entity) {
        return new ProjectMemberSummary(
                entity.getId(),
                displayName(entity),
                trimToNull(entity.getAvatarUrl())
        );
    }

    private AgentSummary toAgentSummary(AgentEntity entity) {
        Long aiModelConfigId = entity.getAiModelConfig() == null ? null : entity.getAiModelConfig().getId();
        String aiModelConfigName = entity.getAiModelConfig() == null ? null : entity.getAiModelConfig().getName();
        return new AgentSummary(
                entity.getId(),
                entity.getName(),
                entity.getType(),
                entity.getStatus(),
                Boolean.TRUE.equals(entity.getEnabled()),
                entity.getAccessType(),
                entity.getBuiltinCode(),
                entity.getCapability(),
                entity.getDescription(),
                aiModelConfigId,
                aiModelConfigName,
                entity.getSystemPrompt(),
                entity.getUserPromptTemplate(),
                entity.getEndpointUrl(),
                entity.getRuntimeType(),
                entity.getRuntimeAgentRef(),
                entity.getRuntimeSessionKeyTemplate(),
                entity.getHttpMethod(),
                entity.getHttpHeaders(),
                entity.getHttpAuthType(),
                hasText(entity.getHttpAuthTokenCiphertext()),
                entity.getHttpRequestTemplate(),
                entity.getHttpResponsePath(),
                entity.getTimeoutSeconds(),
                entity.getProject() == null ? null : entity.getProject().getId(),
                entity.getProject() == null ? null : entity.getProject().getName()
        );
    }

    private TaskSummary toTaskSummary(TaskEntity entity) {
        List<UserEntity> collaborators = entity.getCollaborators().stream()
                .sorted((a, b) -> Long.compare(a.getId(), b.getId()))
                .toList();
        TaskEntity requirementTask = entity.getRequirementTask();
        TaskPrdProjectionEntity prdProjection = taskPrdProjectionRepository.findByTask_Id(entity.getId()).orElse(null);
        com.aiclub.platform.domain.model.TaskGiteeBindingEntity giteeBinding = taskGiteeBindingRepository.findByTask_Id(entity.getId()).orElse(null);
        String prdStatus = prdProjection == null ? null : prdProjection.getStatus();
        String prdStatusMessage = resolveTaskPrdStatusMessage(entity, prdProjection);
        return new TaskSummary(
                entity.getId(),
                entity.getWorkItemCode(),
                entity.getName(),
                normalizeWorkItemType(entity.getWorkItemType()),
                entity.getCreatorUser() == null ? null : entity.getCreatorUser().getId(),
                entity.getCreatorUser() == null ? "" : displayName(entity.getCreatorUser()),
                entity.getStatus(),
                entity.getPriority(),
                entity.getAssignee(),
                entity.getAssigneeUser() == null ? null : entity.getAssigneeUser().getId(),
                collaborators.stream().map(UserEntity::getId).toList(),
                collaborators.stream().map(this::displayName).toList(),
                formatDate(entity.getPlanStartDate()),
                formatDate(entity.getPlanEndDate()),
                entity.getUpdatedAt().format(TIME_FORMATTER),
                entity.getDescription(),
                entity.getRequirementMarkdown(),
                entity.getPrototypeUrl(),
                normalizeModuleName(entity.getWorkItemType(), entity.getModuleName()),
                prdStatus,
                prdStatusMessage,
                prdProjection == null || prdProjection.getWikiSpace() == null ? null : prdProjection.getWikiSpace().getId(),
                prdProjection == null || prdProjection.getPrdWikiDirectory() == null ? null : prdProjection.getPrdWikiDirectory().getId(),
                prdProjection == null || prdProjection.getPrdWikiPage() == null ? null : prdProjection.getPrdWikiPage().getId(),
                entity.isDevPassed(),
                entity.isTestPassed(),
                requirementTask == null ? null : requirementTask.isDevPassed(),
                requirementTask == null ? null : requirementTask.isTestPassed(),
                entity.getWorkHours(),
                entity.getProject().getId(),
                entity.getProject().getName(),
                entity.getAgent() == null ? null : entity.getAgent().getId(),
                entity.getAgent() == null ? null : entity.getAgent().getName(),
                entity.getIteration() == null ? null : entity.getIteration().getId(),
                entity.getIteration() == null ? null : entity.getIteration().getName(),
                entity.getRequirementTask() == null ? null : entity.getRequirementTask().getId(),
                entity.getRequirementTask() == null ? null : entity.getRequirementTask().getName(),
                giteeBinding == null ? null : "GITEE",
                giteeBinding == null ? null : String.valueOf(giteeBinding.getGiteeIssueId()),
                giteeBinding == null ? null : trimToNull(giteeBinding.getGiteeIssueUrl()),
                canDeleteTask(entity)
        );
    }

    private TaskCommentSummary toTaskCommentSummary(TaskCommentEntity entity) {
        String content = defaultString(entity.getContent()).trim();
        String displayContent = RichTextUtils.containsHtml(content)
                ? RichTextUtils.sanitizeCommentHtml(content)
                : content;
        return new TaskCommentSummary(
                entity.getId(),
                entity.getTask().getId(),
                entity.getAuthorUser() == null ? null : entity.getAuthorUser().getId(),
                entity.getAuthorName(),
                displayContent,
                entity.getCreatedAt().format(TIME_FORMATTER)
        );
    }

    private IterationSummary toIterationSummary(IterationEntity entity) {
        return new IterationSummary(
                entity.getId(),
                entity.getProject().getId(),
                entity.getProject().getName(),
                entity.getCreatorUser() == null ? null : entity.getCreatorUser().getId(),
                entity.getName(),
                entity.getGoal(),
                entity.getStatus(),
                formatDate(entity.getStartDate()),
                formatDate(entity.getEndDate()),
                entity.getDescription(),
                entity.getSortOrder(),
                Math.toIntExact(taskRepository.countByProject_IdAndIteration_Id(entity.getProject().getId(), entity.getId())),
                canDeleteIteration(entity)
        );
    }

    private boolean canEditProject(ProjectEntity entity) {
        ProjectDataPermissionService.ProjectDataScope scope = projectDataPermissionService.currentScopeOrNull();
        return projectDataPermissionService.canEditProject(entity, scope);
    }

    private boolean canDeleteTask(TaskEntity entity) {
        ProjectDataPermissionService.ProjectDataScope scope = projectDataPermissionService.currentScopeOrNull();
        return projectDataPermissionService.canDeleteTask(entity, scope);
    }

    private boolean canDeleteIteration(IterationEntity entity) {
        ProjectDataPermissionService.ProjectDataScope scope = projectDataPermissionService.currentScopeOrNull();
        return projectDataPermissionService.canDeleteIteration(entity, scope);
    }

    private String normalizeWorkItemType(String workItemType) {
        String value = hasText(workItemType) ? workItemType.trim() : "任务";
        if ("需求".equals(value) || value.contains("需求")) {
            return "需求";
        }
        if ("缺陷".equals(value) || value.contains("缺陷") || value.toUpperCase().contains("BUG")) {
            return "缺陷";
        }
        return "任务";
    }

    /**
     * 服务端统一归一化状态值，确保前后端切换新状态体系时不会继续写入历史别名。
     */
    private String normalizeWorkItemStatus(String workItemType, String status) {
        return TaskStatusUtils.normalizeStatus(workItemType, status);
    }

    /**
     * 需求模块目前采用自由文本录入，空值统一落为“未分类”。
     */
    private String normalizeModuleName(String workItemType, String moduleName) {
        if (!"需求".equals(workItemType)) {
            return "";
        }
        String normalized = defaultString(moduleName).trim();
        return normalized.isBlank() ? DEFAULT_REQUIREMENT_MODULE_NAME : normalized;
    }

    /**
     * 编辑需求时只有模块、项目或工作项类型实际变化才补录候选。
     * 这样用户删除候选后，保存同一个历史需求的其他字段不会把候选重新带回下拉。
     */
    private void syncRequirementModuleOptionOnUpdate(ProjectEntity project,
                                                     Long previousProjectId,
                                                     String previousWorkItemType,
                                                     String previousModuleName,
                                                     String workItemType,
                                                     String moduleName) {
        if (!"需求".equals(workItemType)) {
            return;
        }
        boolean moduleChanged = !"需求".equals(previousWorkItemType)
                || !Objects.equals(previousProjectId, project.getId())
                || !Objects.equals(previousModuleName, moduleName);
        if (moduleChanged) {
            requirementModuleOptionService.ensureCustomRequirementModule(project, workItemType, moduleName);
        }
    }

    private String normalizeAgentAccessType(String accessType) {
        String value = hasText(accessType) ? accessType.trim().toUpperCase() : AgentExecutionService.ACCESS_BUILT_IN;
        if (!AgentExecutionService.ACCESS_BUILT_IN.equals(value)
                && !AgentExecutionService.ACCESS_LLM_PROMPT.equals(value)
                && !AgentExecutionService.ACCESS_HTTP_API.equals(value)
                && !AgentExecutionService.ACCESS_AGENT_RUNTIME.equals(value)) {
            throw new IllegalArgumentException("Agent 接入方式仅支持 BUILT_IN、LLM_PROMPT、HTTP_API、AGENT_RUNTIME");
        }
        return value;
    }

    private String normalizeHttpMethod(String value) {
        if (!hasText(value)) {
            return "POST";
        }
        String method = value.trim().toUpperCase();
        if (!"GET".equals(method) && !"POST".equals(method) && !"PUT".equals(method)) {
            throw new IllegalArgumentException("HTTP 方法仅支持 GET、POST、PUT");
        }
        return method;
    }

    private String normalizeHttpAuthType(String value) {
        if (!hasText(value)) {
            return "NONE";
        }
        String authType = value.trim().toUpperCase();
        if (!"NONE".equals(authType) && !"BEARER".equals(authType)) {
            throw new IllegalArgumentException("HTTP 认证方式仅支持 NONE、BEARER");
        }
        return authType;
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private LocalDate parseDate(String value, String label) {
        if (!hasText(value)) {
            return null;
        }
        try {
            return LocalDate.parse(value.trim(), DATE_FORMATTER);
        } catch (DateTimeParseException exception) {
            throw new IllegalArgumentException(label + "格式不正确，应为 yyyy-MM-dd");
        }
    }

    private String formatDate(LocalDate value) {
        return value == null ? null : value.format(DATE_FORMATTER);
    }

    private boolean isCompletedStatus(String workItemType, String status) {
        return TaskStatusUtils.isCompletedStatus(workItemType, status);
    }

    private String defaultString(String value) {
        return value == null ? "" : value;
    }

    private String displayName(UserEntity user) {
        String nickname = defaultString(user.getNickname()).trim();
        return nickname.isBlank() ? user.getUsername() : nickname;
    }

    private String abbreviate(String value, int maxLength) {
        String normalized = defaultString(value).trim();
        if (normalized.length() <= maxLength) {
            return normalized;
        }
        return normalized.substring(0, Math.max(maxLength - 3, 0)).trim() + "...";
    }

    /**
     * 统一返回任务侧 PRD 状态提示，避免前端重复拼装错误文案。
     */
    private String resolveTaskPrdStatusMessage(TaskEntity entity, TaskPrdProjectionEntity projection) {
        if (!"需求".equals(defaultString(entity.getWorkItemType()).trim())) {
            return "";
        }
        if (projection == null) {
            return "尚未初始化 PRD";
        }
        String status = defaultString(projection.getStatus()).trim().toUpperCase();
        return switch (status) {
            case TaskPrdService.STATUS_READY -> projection.getPrdWikiPage() == null ? "当前工作项关联的 PRD 页面不存在，请重试初始化" : "";
            case TaskPrdService.STATUS_PENDING -> "PRD 初始化中";
            case TaskPrdService.STATUS_FAILED -> hasText(projection.getLastError()) ? projection.getLastError() : "PRD 初始化失败";
            default -> "";
        };
    }

    /**
     * 当工作项恢复为未逾期状态时，清空逾期通知标记，允许后续再次进入新的逾期周期时重新提醒。
     */
    private void syncOverdueNotificationState(TaskEntity task) {
        if (!TaskStatusUtils.isOverdue(task.getPlanEndDate(), task.getWorkItemType(), task.getStatus(), LocalDate.now())) {
            task.setOverdueNotifiedAt(null);
        }
    }

    /**
     * 需求模板字段的内部载荷。
     */
    private record RequirementDocumentPayload(
            String requirementMarkdown,
            String prototypeUrl,
            String description
    ) {
    }

    /**
     * 工作项计划时间的内部载荷。
     */
    private record TaskPlanDateRange(
            LocalDate planStartDate,
            LocalDate planEndDate
    ) {
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }
}
