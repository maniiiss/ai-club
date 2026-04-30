package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.AgentEntity;
import com.aiclub.platform.domain.model.ExecutionTaskEntity;
import com.aiclub.platform.domain.model.IterationEntity;
import com.aiclub.platform.domain.model.PlatformToolAuditEntity;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.ProjectGitlabBindingEntity;
import com.aiclub.platform.domain.model.TaskEntity;
import com.aiclub.platform.domain.model.TestPlanEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.PlatformToolAction;
import com.aiclub.platform.dto.PlatformToolCandidate;
import com.aiclub.platform.dto.PlatformToolDefinition;
import com.aiclub.platform.dto.DocumentMarkdownResult;
import com.aiclub.platform.dto.PlatformToolRequest;
import com.aiclub.platform.dto.PlatformToolResult;
import com.aiclub.platform.dto.WikiSpacePageDetail;
import com.aiclub.platform.dto.WikiSpacePageSummary;
import com.aiclub.platform.dto.WikiSpaceSearchResult;
import com.aiclub.platform.exception.ForbiddenException;
import com.aiclub.platform.repository.AgentRepository;
import com.aiclub.platform.repository.ExecutionTaskRepository;
import com.aiclub.platform.repository.IterationRepository;
import com.aiclub.platform.repository.ProjectGitlabBindingRepository;
import com.aiclub.platform.repository.ProjectRepository;
import com.aiclub.platform.repository.TaskRepository;
import com.aiclub.platform.repository.TestPlanRepository;
import com.aiclub.platform.repository.UserRepository;
import com.aiclub.platform.security.AuthContextHolder;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 平台工具执行器。
 * 第一版只自动执行只读工具，写工具由 Hermes 动作卡片确认后走既有业务 API。
 */
@Service
@Transactional(readOnly = true)
public class PlatformToolExecutor {

    private static final Pattern GITLAB_PATH_PATTERN = Pattern.compile("([A-Za-z0-9._-]+(?:/[A-Za-z0-9._-]+){1,4})");

    private final PlatformToolRegistry platformToolRegistry;
    private final ToolExecutionAuditService toolExecutionAuditService;
    private final ProjectDataPermissionService projectDataPermissionService;
    private final ProjectRepository projectRepository;
    private final TaskRepository taskRepository;
    private final UserRepository userRepository;
    private final AgentRepository agentRepository;
    private final ProjectGitlabBindingRepository projectGitlabBindingRepository;
    private final ExecutionTaskRepository executionTaskRepository;
    private final TestPlanRepository testPlanRepository;
    private final IterationRepository iterationRepository;
    private final ExecutionWorkflowService executionWorkflowService;
    private final GitlabManagementService gitlabManagementService;
    private final RepositoryScanRulesetService repositoryScanRulesetService;
    private final WikiSpaceService wikiSpaceService;
    private final DocumentMarkdownService documentMarkdownService;

    public PlatformToolExecutor(PlatformToolRegistry platformToolRegistry,
                                ToolExecutionAuditService toolExecutionAuditService,
                                ProjectDataPermissionService projectDataPermissionService,
                                ProjectRepository projectRepository,
                                TaskRepository taskRepository,
                                UserRepository userRepository,
                                AgentRepository agentRepository,
                                ProjectGitlabBindingRepository projectGitlabBindingRepository,
                                ExecutionTaskRepository executionTaskRepository,
                                TestPlanRepository testPlanRepository,
                                IterationRepository iterationRepository,
                                ExecutionWorkflowService executionWorkflowService,
                                GitlabManagementService gitlabManagementService,
                                RepositoryScanRulesetService repositoryScanRulesetService,
                                WikiSpaceService wikiSpaceService,
                                DocumentMarkdownService documentMarkdownService) {
        this.platformToolRegistry = platformToolRegistry;
        this.toolExecutionAuditService = toolExecutionAuditService;
        this.projectDataPermissionService = projectDataPermissionService;
        this.projectRepository = projectRepository;
        this.taskRepository = taskRepository;
        this.userRepository = userRepository;
        this.agentRepository = agentRepository;
        this.projectGitlabBindingRepository = projectGitlabBindingRepository;
        this.executionTaskRepository = executionTaskRepository;
        this.testPlanRepository = testPlanRepository;
        this.iterationRepository = iterationRepository;
        this.executionWorkflowService = executionWorkflowService;
        this.gitlabManagementService = gitlabManagementService;
        this.repositoryScanRulesetService = repositoryScanRulesetService;
        this.wikiSpaceService = wikiSpaceService;
        this.documentMarkdownService = documentMarkdownService;
    }

    public PlatformToolResult execute(PlatformToolRequest request) {
        PlatformToolDefinition definition = platformToolRegistry.requireDefinition(request.toolCode());
        if (!platformToolRegistry.isEnabled(request.toolCode())) {
            throw new ForbiddenException("平台工具已停用: " + request.toolCode());
        }
        requireToolPermission(definition);
        PlatformToolAuditEntity audit = toolExecutionAuditService.createAudit(definition, request);
        try {
            PlatformToolResult result = switch (request.toolCode()) {
                case PlatformToolRegistry.TOOL_PROJECT_SEARCH -> searchProjects(request);
                case PlatformToolRegistry.TOOL_PROJECT_GET_DETAIL -> getProjectDetail(request);
                case PlatformToolRegistry.TOOL_PROJECT_LIST_ITERATIONS -> listProjectIterations(request);
                case PlatformToolRegistry.TOOL_PROJECT_GET_ITERATION_DETAIL -> getIterationDetail(request);
                case PlatformToolRegistry.TOOL_USER_RESOLVE_PROJECT_MEMBER -> resolveProjectMember(request);
                case PlatformToolRegistry.TOOL_USER_LIST_PROJECT_MEMBERS -> listProjectMembers(request);
                case PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH -> searchWorkItems(request);
                case PlatformToolRegistry.TOOL_WORK_ITEM_GET_DETAIL -> getWorkItemDetail(request);
                case PlatformToolRegistry.TOOL_AGENT_LIST_AVAILABLE -> listAvailableAgents(request);
                case PlatformToolRegistry.TOOL_AGENT_GET_DETAIL -> getAgentDetail(request);
                case PlatformToolRegistry.TOOL_GITLAB_BINDING_SEARCH -> searchGitlabBindings(request);
                case PlatformToolRegistry.TOOL_REPO_SCAN_LIST_RULESETS -> listRepositoryScanRulesets(request);
                case PlatformToolRegistry.TOOL_REPO_SCAN_START -> startRepositoryScan(request);
                case PlatformToolRegistry.TOOL_REPO_SCAN_SEARCH -> searchRepositoryScans(request);
                case PlatformToolRegistry.TOOL_EXECUTION_TASK_SEARCH -> searchExecutionTasks(request);
                case PlatformToolRegistry.TOOL_EXECUTION_TASK_GET_DETAIL -> getExecutionTaskDetail(request);
                case PlatformToolRegistry.TOOL_TEST_PLAN_SEARCH -> searchTestPlans(request);
                case PlatformToolRegistry.TOOL_TEST_PLAN_GET_DETAIL -> getTestPlanDetail(request);
                case PlatformToolRegistry.TOOL_DOCUMENT_CONVERT_MARKDOWN -> convertDocumentToMarkdown(request);
                case PlatformToolRegistry.TOOL_WIKI_SPACE_SEARCH -> searchWikiPages(request);
                case PlatformToolRegistry.TOOL_WIKI_PAGE_GET_DETAIL -> getWikiPageDetail(request);
                default -> throw new IllegalArgumentException("平台工具暂不支持: " + request.toolCode());
            };
            toolExecutionAuditService.finishSuccess(audit, result);
            return result;
        } catch (RuntimeException exception) {
            toolExecutionAuditService.finishFailure(audit, exception);
            throw exception;
        }
    }

    private PlatformToolResult searchProjects(PlatformToolRequest request) {
        String keyword = stringValue(request.payload(), "keyword");
        List<PlatformToolCandidate> candidates = projectRepository.findAll(Sort.by(Sort.Direction.DESC, "id")).stream()
                .filter(this::canSeeProject)
                .filter(project -> isBlank(keyword) || containsAny(project.getName(), keyword) || containsAny(project.getDescription(), keyword))
                .limit(5)
                .map(this::projectCandidate)
                .toList();
        return result(request.toolCode(), "搜索项目", "找到 " + candidates.size() + " 个相关项目", candidates, Map.of("keyword", defaultString(keyword)));
    }

    private PlatformToolResult getProjectDetail(PlatformToolRequest request) {
        ProjectEntity project = requireVisibleProject(longValue(request.payload(), "projectId"));
        PlatformToolCandidate candidate = projectCandidate(project);
        return result(request.toolCode(), "项目详情", "已读取项目 “" + project.getName() + "”", List.of(candidate), Map.of("projectId", project.getId()));
    }

    private PlatformToolResult listProjectIterations(PlatformToolRequest request) {
        ProjectEntity project = requireVisibleProject(longValue(request.payload(), "projectId"));
        List<PlatformToolCandidate> candidates = iterationRepository.findAllByProject_IdOrderBySortOrderAscIdAsc(project.getId()).stream()
                .map(iteration -> new PlatformToolCandidate(
                        "ITERATION",
                        iteration.getId(),
                        iteration.getName(),
                        "状态：" + defaultString(iteration.getStatus()) + " / 目标：" + defaultString(iteration.getGoal()),
                        "/projects/" + project.getId() + "/iterations?iterationId=" + iteration.getId(),
                        Map.of("projectId", project.getId(), "status", defaultString(iteration.getStatus())),
                        List.of()
                ))
                .toList();
        return result(request.toolCode(), "项目迭代列表", "项目 “" + project.getName() + "” 有 " + candidates.size() + " 个迭代", candidates, Map.of("projectId", project.getId()));
    }

    /**
     * 返回当前迭代的结构化详情，供 Hermes 自主生成发版总结、风险概览或工作项分类说明。
     */
    private PlatformToolResult getIterationDetail(PlatformToolRequest request) {
        Long projectId = longValue(request.payload(), "projectId");
        Long iterationId = longValue(request.payload(), "iterationId");
        ProjectEntity project = requireVisibleProject(projectId);
        IterationEntity iteration = requireVisibleIteration(project.getId(), iterationId);
        List<TaskEntity> workItems = taskRepository.findAll(Sort.by(Sort.Direction.DESC, "updatedAt", "id")).stream()
                .filter(task -> Objects.equals(task.getProject().getId(), project.getId()))
                .filter(task -> task.getIteration() != null && Objects.equals(task.getIteration().getId(), iteration.getId()))
                .filter(this::canSeeTask)
                .toList();

        long deliveredCount = workItems.stream().filter(task -> isDeliveredStatus(task.getStatus())).count();
        long pendingCount = Math.max(workItems.size() - deliveredCount, 0);
        long requirementCount = countWorkItemsByType(workItems, "需求");
        long taskCount = countWorkItemsByType(workItems, "任务");
        long defectCount = countWorkItemsByType(workItems, "缺陷");

        LinkedHashMap<String, Object> payload = new LinkedHashMap<>();
        payload.put("projectId", project.getId());
        payload.put("projectName", defaultString(project.getName()));
        payload.put("iterationId", iteration.getId());
        payload.put("iterationName", defaultString(iteration.getName()));
        payload.put("status", defaultString(iteration.getStatus()));
        payload.put("goal", defaultString(iteration.getGoal()));
        payload.put("startDate", iteration.getStartDate() == null ? "" : String.valueOf(iteration.getStartDate()));
        payload.put("endDate", iteration.getEndDate() == null ? "" : String.valueOf(iteration.getEndDate()));
        payload.put("description", defaultString(iteration.getDescription()));
        payload.put("totalWorkItemCount", workItems.size());
        payload.put("deliveredCount", deliveredCount);
        payload.put("pendingCount", pendingCount);
        payload.put("requirementCount", requirementCount);
        payload.put("taskCount", taskCount);
        payload.put("defectCount", defectCount);
        payload.put("workItems", summarizeWorkItems(workItems, 20));
        payload.put("requirements", summarizeWorkItemsByType(workItems, "需求", 10));
        payload.put("deliveredRequirements", summarizeDeliveredWorkItemsByType(workItems, "需求", 10));
        payload.put("defects", summarizeWorkItemsByType(workItems, "缺陷", 10));
        payload.put("fixedDefects", summarizeDeliveredWorkItemsByType(workItems, "缺陷", 10));
        payload.put("pendingItems", summarizePendingWorkItems(workItems, 10));

        PlatformToolCandidate candidate = new PlatformToolCandidate(
                "ITERATION",
                iteration.getId(),
                defaultString(iteration.getName()),
                "状态：" + defaultString(iteration.getStatus()) + " / 目标：" + defaultString(iteration.getGoal()),
                "/projects/" + project.getId() + "/iterations?iterationId=" + iteration.getId(),
                Map.copyOf(payload),
                List.of()
        );
        String summary = "已读取当前迭代“" + defaultString(iteration.getName()) + "”，共 "
                + workItems.size() + " 个工作项，含 "
                + requirementCount + " 个需求、"
                + taskCount + " 个任务、"
                + defectCount + " 个缺陷，已完成/已通过 "
                + deliveredCount + " 个。";
        return result(request.toolCode(), "迭代详情", summary, List.of(candidate), metadata("projectId", project.getId(), "iterationId", iteration.getId()));
    }

    private PlatformToolResult resolveProjectMember(PlatformToolRequest request) {
        ProjectEntity project = requireVisibleProject(longValue(request.payload(), "projectId"));
        String keyword = stringValue(request.payload(), "keyword");
        List<PlatformToolCandidate> candidates = projectParticipants(project).stream()
                .filter(user -> isBlank(keyword) || containsAny(user.getUsername(), keyword) || containsAny(user.getNickname(), keyword))
                .limit(5)
                .map(user -> userCandidate(project.getId(), user))
                .toList();
        return result(request.toolCode(), "解析项目成员", "找到 " + candidates.size() + " 个成员候选", candidates, Map.of("projectId", project.getId(), "keyword", defaultString(keyword)));
    }

    private PlatformToolResult listProjectMembers(PlatformToolRequest request) {
        ProjectEntity project = requireVisibleProject(longValue(request.payload(), "projectId"));
        List<PlatformToolCandidate> candidates = projectParticipants(project).stream()
                .map(user -> userCandidate(project.getId(), user))
                .toList();
        return result(request.toolCode(), "项目成员列表", "项目 “" + project.getName() + "” 有 " + candidates.size() + " 个成员候选", candidates, Map.of("projectId", project.getId()));
    }

    private PlatformToolResult searchWorkItems(PlatformToolRequest request) {
        String keyword = stringValue(request.payload(), "keyword");
        String workItemType = stringValue(request.payload(), "workItemType");
        Long projectId = nullableLongValue(request.payload(), "projectId");
        Long iterationId = nullableLongValue(request.payload(), "iterationId");
        List<PlatformToolCandidate> candidates = taskRepository.findAll(Sort.by(Sort.Direction.DESC, "updatedAt", "id")).stream()
                .filter(task -> projectId == null || Objects.equals(task.getProject().getId(), projectId))
                .filter(task -> iterationId == null || task.getIteration() != null && Objects.equals(task.getIteration().getId(), iterationId))
                .filter(this::canSeeTask)
                .filter(task -> isBlank(workItemType) || defaultString(task.getWorkItemType()).equals(workItemType))
                .filter(task -> isBlank(keyword)
                        || containsAny(task.getName(), keyword)
                        || containsAny(task.getDescription(), keyword)
                        || containsAny(task.getWorkItemCode(), keyword))
                .limit(5)
                .map(task -> workItemCandidate(task, true))
                .toList();
        return result(request.toolCode(), "搜索工作项", "找到 " + candidates.size() + " 个相关工作项", candidates,
                metadata("keyword", defaultString(keyword), "projectId", projectId, "iterationId", iterationId));
    }

    private PlatformToolResult getWorkItemDetail(PlatformToolRequest request) {
        TaskEntity task = requireVisibleTask(longValue(request.payload(), "workItemId"));
        return result(request.toolCode(), "工作项详情", "已读取工作项 “" + task.getName() + "”", List.of(workItemCandidate(task, true)), Map.of("workItemId", task.getId()));
    }

    private PlatformToolResult listAvailableAgents(PlatformToolRequest request) {
        Long projectId = nullableLongValue(request.payload(), "projectId");
        if (projectId != null) {
            requireVisibleProject(projectId);
        }
        List<PlatformToolCandidate> candidates = availableAgents(projectId).stream()
                .limit(10)
                .map(this::agentCandidate)
                .toList();
        return result(request.toolCode(), "可用 Agent 列表", "找到 " + candidates.size() + " 个可用 Agent", candidates,
                metadata("projectId", projectId));
    }

    private PlatformToolResult getAgentDetail(PlatformToolRequest request) {
        AgentEntity agent = agentRepository.findById(longValue(request.payload(), "agentId"))
                .orElseThrow(() -> new NoSuchElementException("Agent 不存在"));
        projectDataPermissionService.requireAgentVisible(agent);
        return result(request.toolCode(), "Agent 详情", "已读取 Agent “" + agent.getName() + "”", List.of(agentCandidate(agent)), Map.of("agentId", agent.getId()));
    }

    /**
     * 按项目名、仓库路径或 GitLab 项目标识搜索绑定仓库。
     */
    private PlatformToolResult searchGitlabBindings(PlatformToolRequest request) {
        String keyword = stringValue(request.payload(), "keyword");
        Long projectId = nullableLongValue(request.payload(), "projectId");
        List<String> searchableKeywords = resolveGitlabBindingKeywords(keyword);
        List<PlatformToolCandidate> candidates = projectGitlabBindingRepository.findAll(Sort.by(Sort.Direction.ASC, "id")).stream()
                .filter(binding -> projectId == null || Objects.equals(binding.getProject().getId(), projectId))
                .filter(binding -> canSeeProject(binding.getProject()))
                .filter(binding -> searchableKeywords.isEmpty()
                        || searchableKeywords.stream().anyMatch(candidateKeyword ->
                        containsAny(binding.getProject().getName(), candidateKeyword)
                                || containsAny(binding.getGitlabProjectPath(), candidateKeyword)
                                || containsAny(binding.getGitlabProjectRef(), candidateKeyword)
                                || containsAny(binding.getGitlabProjectName(), candidateKeyword)))
                .limit(8)
                .map(this::gitlabBindingCandidate)
                .toList();
        return result(request.toolCode(), "搜索仓库绑定", "找到 " + candidates.size() + " 个相关仓库", candidates,
                metadata("keyword", defaultString(keyword), "projectId", projectId));
    }

    /**
     * 返回仓库扫描可用规则集，供 Hermes 在发起扫描前先完成规则集确认。
     */
    private PlatformToolResult listRepositoryScanRulesets(PlatformToolRequest request) {
        List<PlatformToolCandidate> candidates = gitlabManagementService.listScanRulesets().stream()
                .map(ruleset -> new PlatformToolCandidate(
                        "REPO_SCAN_RULESET",
                        null,
                        defaultString(ruleset.name()),
                        defaultString(ruleset.description()),
                        "",
                        Map.of(
                                "rulesetCode", defaultString(ruleset.code()),
                                "rulesetName", defaultString(ruleset.name()),
                                "description", defaultString(ruleset.description()),
                                "engineType", defaultString(ruleset.engineType()),
                                "defaultSelected", ruleset.defaultSelected()
                        ),
                        List.of()
                ))
                .toList();
        return result(request.toolCode(), "扫描规则集列表", "找到 " + candidates.size() + " 个可用规则集", candidates, Map.of());
    }

    /**
     * 创建一条仓库规范扫描任务。
     */
    private PlatformToolResult startRepositoryScan(PlatformToolRequest request) {
        Long bindingId = longValue(request.payload(), "bindingId");
        String branch = stringValue(request.payload(), "branch");
        String rulesetCode = stringValue(request.payload(), "rulesetCode");
        if (rulesetCode.isBlank()) {
            rulesetCode = repositoryScanRulesetService.requireDefaultRuleset().getCode();
        }
        var executionTask = gitlabManagementService.createBindingScanTask(
                bindingId,
                new com.aiclub.platform.dto.request.GitlabBindingScanTaskRequest(
                        branch.isBlank() ? "" : branch.trim(),
                        rulesetCode.isBlank() ? "" : rulesetCode.trim(),
                        null
                )
        );
        PlatformToolCandidate candidate = new PlatformToolCandidate(
                "EXECUTION_TASK",
                executionTask.id(),
                executionTask.title(),
                "状态：" + defaultString(executionTask.status()) + " / 场景：" + defaultString(executionTask.scenarioName()),
                "/tasks/" + executionTask.id(),
                Map.of("executionTaskId", executionTask.id(), "projectId", executionTask.projectId()),
                List.of()
        );
        return result(request.toolCode(), "发起仓库扫描", "已创建仓库规范扫描任务", List.of(candidate), Map.of("bindingId", bindingId));
    }

    /**
     * 查询指定绑定仓库最近的扫描任务。
     * 第一版直接在输入载荷 JSON 中匹配 bindingId，便于快速复用现有执行中心模型。
     */
    private PlatformToolResult searchRepositoryScans(PlatformToolRequest request) {
        Long bindingId = nullableLongValue(request.payload(), "bindingId");
        String status = stringValue(request.payload(), "status");
        List<PlatformToolCandidate> candidates = executionTaskRepository.findAll(Sort.by(Sort.Direction.DESC, "createdAt", "id")).stream()
                .filter(executionTask -> ExecutionWorkflowService.SCENARIO_CODEBASE_COMPLIANCE_SCAN.equalsIgnoreCase(executionTask.getScenarioCode()))
                .filter(executionTask -> canSeeProject(executionTask.getProject()))
                .filter(executionTask -> isBlank(status) || defaultString(executionTask.getStatus()).equalsIgnoreCase(status))
                .filter(executionTask -> bindingId == null || containsAny(executionTask.getInputPayload(), "\"bindingId\":" + bindingId))
                .limit(8)
                .map(this::executionTaskCandidate)
                .toList();
        return result(request.toolCode(), "搜索仓库扫描", "找到 " + candidates.size() + " 条扫描任务", candidates,
                metadata("bindingId", bindingId, "status", defaultString(status)));
    }

    private PlatformToolResult searchExecutionTasks(PlatformToolRequest request) {
        String keyword = stringValue(request.payload(), "keyword");
        String status = stringValue(request.payload(), "status");
        Long projectId = nullableLongValue(request.payload(), "projectId");
        List<PlatformToolCandidate> candidates = executionTaskRepository.findAll(Sort.by(Sort.Direction.DESC, "createdAt", "id")).stream()
                .filter(executionTask -> projectId == null || Objects.equals(executionTask.getProject().getId(), projectId))
                .filter(executionTask -> canSeeProject(executionTask.getProject()))
                .filter(executionTask -> isBlank(status) || defaultString(executionTask.getStatus()).equalsIgnoreCase(status))
                .filter(executionTask -> isBlank(keyword)
                        || containsAny(executionTask.getTitle(), keyword)
                        || containsAny(executionTask.getLatestSummary(), keyword)
                        || (executionTask.getWorkItem() != null && containsAny(executionTask.getWorkItem().getName(), keyword)))
                .limit(5)
                .map(this::executionTaskCandidate)
                .toList();
        return result(request.toolCode(), "搜索执行任务", "找到 " + candidates.size() + " 个执行任务", candidates,
                metadata("keyword", defaultString(keyword), "status", defaultString(status), "projectId", projectId));
    }

    private PlatformToolResult getExecutionTaskDetail(PlatformToolRequest request) {
        ExecutionTaskEntity executionTask = executionTaskRepository.findById(longValue(request.payload(), "executionTaskId"))
                .orElseThrow(() -> new NoSuchElementException("执行任务不存在"));
        if (!canSeeProject(executionTask.getProject())) {
            throw new ForbiddenException("无权访问当前执行任务");
        }
        return result(request.toolCode(), "执行任务详情", "已读取执行任务 “" + executionTask.getTitle() + "”", List.of(executionTaskCandidate(executionTask)), Map.of("executionTaskId", executionTask.getId()));
    }

    private PlatformToolResult searchTestPlans(PlatformToolRequest request) {
        String keyword = stringValue(request.payload(), "keyword");
        String status = stringValue(request.payload(), "status");
        Long projectId = nullableLongValue(request.payload(), "projectId");
        Long iterationId = nullableLongValue(request.payload(), "iterationId");
        List<PlatformToolCandidate> candidates = testPlanRepository.findAll(Sort.by(Sort.Direction.DESC, "updatedAt", "id")).stream()
                .filter(testPlan -> canSeeProject(testPlan.getProject()))
                .filter(testPlan -> projectId == null || Objects.equals(testPlan.getProject().getId(), projectId))
                .filter(testPlan -> iterationId == null || testPlan.getIteration() != null && Objects.equals(testPlan.getIteration().getId(), iterationId))
                .filter(testPlan -> isBlank(status) || defaultString(testPlan.getStatus()).equalsIgnoreCase(status))
                .filter(testPlan -> isBlank(keyword) || containsAny(testPlan.getName(), keyword) || containsAny(testPlan.getDescription(), keyword))
                .limit(5)
                .map(this::testPlanCandidate)
                .toList();
        return result(request.toolCode(), "搜索测试计划", "找到 " + candidates.size() + " 个测试计划", candidates,
                metadata("keyword", defaultString(keyword), "projectId", projectId, "iterationId", iterationId));
    }

    private PlatformToolResult getTestPlanDetail(PlatformToolRequest request) {
        TestPlanEntity testPlan = testPlanRepository.findById(longValue(request.payload(), "testPlanId"))
                .orElseThrow(() -> new NoSuchElementException("测试计划不存在"));
        if (!canSeeProject(testPlan.getProject())) {
            throw new ForbiddenException("无权访问当前测试计划");
        }
        return result(request.toolCode(), "测试计划详情", "已读取测试计划 “" + testPlan.getName() + "”", List.of(testPlanCandidate(testPlan)), Map.of("testPlanId", testPlan.getId()));
    }

    /**
     * 按文档资产把原始文件转换为 Markdown。
     */
    private PlatformToolResult convertDocumentToMarkdown(PlatformToolRequest request) {
        Long assetId = longValue(request.payload(), "assetId");
        String scene = stringValue(request.payload(), "scene");
        Integer maxChars = nullableIntegerValue(request.payload(), "maxChars");
        DocumentMarkdownResult converted = documentMarkdownService.convert(assetId, scene, maxChars);
        PlatformToolCandidate candidate = new PlatformToolCandidate(
                "DOCUMENT_MARKDOWN",
                converted.assetId(),
                defaultString(converted.suggestedTitle()).isBlank() ? defaultString(converted.fileName()) : defaultString(converted.suggestedTitle()),
                "格式：" + defaultString(converted.sourceFormat()) + (converted.truncated() ? " / 已截断" : ""),
                "",
                Map.of(
                        "assetId", converted.assetId(),
                        "fileName", defaultString(converted.fileName()),
                        "suggestedTitle", defaultString(converted.suggestedTitle()),
                        "sourceFormat", defaultString(converted.sourceFormat()),
                        "markdown", defaultString(converted.markdown()),
                        "truncated", converted.truncated(),
                        "warnings", converted.warnings()
                ),
                List.of()
        );
        return result(
                request.toolCode(),
                "文档转 Markdown",
                "已把文档 “" + defaultString(converted.fileName()) + "” 转为 Markdown",
                List.of(candidate),
                metadata("assetId", converted.assetId(), "scene", defaultString(scene), "maxChars", maxChars)
        );
    }

    private PlatformToolResult searchWikiPages(PlatformToolRequest request) {
        Long projectId = nullableLongValue(request.payload(), "projectId");
        Long spaceId = nullableLongValue(request.payload(), "spaceId");
        String query = stringValue(request.payload(), "query");
        List<WikiSpaceSearchResult> semanticResults = wikiSpaceService.semanticSearchPages(query, spaceId, projectId);
        List<PlatformToolCandidate> candidates = semanticResults.stream()
                .map(WikiSpaceSearchResult::page)
                .limit(8)
                .map(this::wikiPageCandidate)
                .toList();
        if (candidates.isEmpty()) {
            candidates = wikiSpaceService.searchPages(query, spaceId, projectId).stream()
                    .limit(8)
                    .map(this::wikiPageCandidate)
                    .toList();
        }
        return result(request.toolCode(), "搜索 Wiki", "找到 " + candidates.size() + " 个相关 Wiki 页面", candidates,
                metadata("spaceId", spaceId, "projectId", projectId, "query", defaultString(query)));
    }

    private PlatformToolResult getWikiPageDetail(PlatformToolRequest request) {
        Long spaceId = longValue(request.payload(), "spaceId");
        Long pageId = longValue(request.payload(), "pageId");
        WikiSpacePageDetail page = wikiSpaceService.getPageDetail(spaceId, pageId);
        PlatformToolCandidate candidate = new PlatformToolCandidate(
                "WIKI_PAGE",
                page.id(),
                page.title(),
                "版本：v" + page.currentVersionNumber() + " / 空间：" + defaultString(page.spaceName()),
                "/wiki/spaces/" + spaceId + "/pages/" + page.id(),
                Map.of(
                        "spaceId", spaceId,
                        "pageId", page.id(),
                        "slug", defaultString(page.slug()),
                        "title", defaultString(page.title()),
                        "content", abbreviate(defaultString(page.content()), 2000)
                ),
                List.of()
        );
        return result(request.toolCode(), "Wiki 页面详情", "已读取 Wiki 页面 “" + page.title() + "”", List.of(candidate), Map.of("pageId", page.id()));
    }

    private PlatformToolCandidate projectCandidate(ProjectEntity project) {
        return new PlatformToolCandidate(
                "PROJECT",
                project.getId(),
                project.getName(),
                "状态：" + defaultString(project.getStatus()) + " / 负责人：" + defaultString(project.getOwner()),
                "/projects/" + project.getId() + "/iterations",
                Map.of(
                        "projectId", project.getId(),
                        "projectName", defaultString(project.getName()),
                        "status", defaultString(project.getStatus()),
                        "owner", defaultString(project.getOwner())
                ),
                List.of()
        );
    }

    private PlatformToolCandidate userCandidate(Long projectId, UserEntity user) {
        return new PlatformToolCandidate(
                "USER",
                user.getId(),
                displayName(user),
                "用户名：" + defaultString(user.getUsername()),
                "",
                Map.of(
                        "projectId", projectId,
                        "userId", user.getId(),
                        "username", defaultString(user.getUsername()),
                        "nickname", defaultString(user.getNickname())
                ),
                List.of()
        );
    }

    private PlatformToolCandidate workItemCandidate(TaskEntity task, boolean withExecutionAction) {
        List<PlatformToolAction> actions = withExecutionAction
                ? List.of(new PlatformToolAction(
                        "CREATE_EXECUTION_TASK",
                        "针对该工作项发起开发执行",
                        "基于 “" + task.getName() + "” 创建开发执行任务。",
                        true,
                        Map.of(
                                "scenarioCode", ExecutionWorkflowService.SCENARIO_DEVELOPMENT_IMPLEMENTATION,
                                "projectId", task.getProject().getId(),
                                "workItemId", task.getId(),
                                "triggerSource", "HERMES"
                        )
                ))
                : List.of();
        return new PlatformToolCandidate(
                "WORK_ITEM",
                task.getId(),
                defaultString(task.getWorkItemCode()) + " " + task.getName(),
                "类型：" + defaultString(task.getWorkItemType()) + " / 状态：" + defaultString(task.getStatus()) + " / 项目：" + task.getProject().getName(),
                "/projects/" + task.getProject().getId() + "/iterations?openTaskId=" + task.getId(),
                Map.of(
                        "projectId", task.getProject().getId(),
                        "projectName", defaultString(task.getProject().getName()),
                        "workItemId", task.getId(),
                        "workItemCode", defaultString(task.getWorkItemCode()),
                        "workItemName", defaultString(task.getName()),
                        "workItemType", defaultString(task.getWorkItemType()),
                        "status", defaultString(task.getStatus())
                ),
                actions
        );
    }

    private List<Map<String, Object>> summarizeWorkItems(List<TaskEntity> tasks, int limit) {
        if (tasks == null || tasks.isEmpty() || limit <= 0) {
            return List.of();
        }
        return tasks.stream()
                .limit(limit)
                .map(this::workItemSummaryPayload)
                .toList();
    }

    private List<Map<String, Object>> summarizeWorkItemsByType(List<TaskEntity> tasks, String workItemType, int limit) {
        if (tasks == null || tasks.isEmpty() || limit <= 0) {
            return List.of();
        }
        return tasks.stream()
                .filter(task -> workItemType.equals(defaultString(task.getWorkItemType())))
                .limit(limit)
                .map(this::workItemSummaryPayload)
                .toList();
    }

    private List<Map<String, Object>> summarizeDeliveredWorkItemsByType(List<TaskEntity> tasks, String workItemType, int limit) {
        if (tasks == null || tasks.isEmpty() || limit <= 0) {
            return List.of();
        }
        return tasks.stream()
                .filter(task -> workItemType.equals(defaultString(task.getWorkItemType())))
                .filter(task -> isDeliveredStatus(task.getStatus()))
                .limit(limit)
                .map(this::workItemSummaryPayload)
                .toList();
    }

    private List<Map<String, Object>> summarizePendingWorkItems(List<TaskEntity> tasks, int limit) {
        if (tasks == null || tasks.isEmpty() || limit <= 0) {
            return List.of();
        }
        return tasks.stream()
                .filter(task -> !isDeliveredStatus(task.getStatus()))
                .limit(limit)
                .map(this::workItemSummaryPayload)
                .toList();
    }

    private Map<String, Object> workItemSummaryPayload(TaskEntity task) {
        LinkedHashMap<String, Object> payload = new LinkedHashMap<>();
        payload.put("workItemId", task.getId());
        payload.put("workItemCode", defaultString(task.getWorkItemCode()));
        payload.put("name", defaultString(task.getName()));
        payload.put("workItemType", defaultString(task.getWorkItemType()));
        payload.put("status", defaultString(task.getStatus()));
        payload.put("priority", defaultString(task.getPriority()));
        payload.put("assignee", defaultString(task.getAssignee()));
        payload.put("route", "/projects/" + task.getProject().getId() + "/iterations?openTaskId=" + task.getId());
        return Map.copyOf(payload);
    }

    private PlatformToolCandidate agentCandidate(AgentEntity agent) {
        return new PlatformToolCandidate(
                "AGENT",
                agent.getId(),
                agent.getName(),
                "类型：" + defaultString(agent.getType()) + " / 接入：" + defaultString(agent.getAccessType()) + " / 状态：" + defaultString(agent.getStatus()),
                "",
                Map.of(
                        "agentId", agent.getId(),
                        "agentName", defaultString(agent.getName()),
                        "projectId", agent.getProject() == null ? "" : agent.getProject().getId(),
                        "enabled", Boolean.TRUE.equals(agent.getEnabled())
                ),
                List.of()
        );
    }

    private PlatformToolCandidate gitlabBindingCandidate(ProjectGitlabBindingEntity binding) {
        return new PlatformToolCandidate(
                "GITLAB_BINDING",
                binding.getId(),
                defaultString(binding.getGitlabProjectPath()).isBlank() ? defaultString(binding.getGitlabProjectRef()) : defaultString(binding.getGitlabProjectPath()),
                "项目：" + binding.getProject().getName() + " / 默认分支：" + defaultString(binding.getDefaultTargetBranch()),
                "/gitlab",
                Map.of(
                        "bindingId", binding.getId(),
                        "projectId", binding.getProject().getId(),
                        "projectName", defaultString(binding.getProject().getName()),
                        "gitlabProjectPath", defaultString(binding.getGitlabProjectPath()),
                        "gitlabProjectRef", defaultString(binding.getGitlabProjectRef()),
                        "defaultTargetBranch", defaultString(binding.getDefaultTargetBranch())
                ),
                List.of()
        );
    }

    private PlatformToolCandidate executionTaskCandidate(ExecutionTaskEntity executionTask) {
        return new PlatformToolCandidate(
                "EXECUTION_TASK",
                executionTask.getId(),
                executionTask.getTitle(),
                "场景：" + executionWorkflowService.scenarioName(executionTask.getScenarioCode()) + " / 状态：" + defaultString(executionTask.getStatus()),
                "/tasks/" + executionTask.getId(),
                Map.of(
                        "executionTaskId", executionTask.getId(),
                        "projectId", executionTask.getProject().getId(),
                        "title", defaultString(executionTask.getTitle()),
                        "status", defaultString(executionTask.getStatus())
                ),
                List.of()
        );
    }

    private PlatformToolCandidate testPlanCandidate(TestPlanEntity testPlan) {
        return new PlatformToolCandidate(
                "TEST_PLAN",
                testPlan.getId(),
                testPlan.getName(),
                "状态：" + defaultString(testPlan.getStatus()) + " / 项目：" + testPlan.getProject().getName() + " / 用例数：" + testPlan.getCases().size(),
                "/tests/" + testPlan.getId(),
                Map.of(
                        "testPlanId", testPlan.getId(),
                        "projectId", testPlan.getProject().getId(),
                        "testPlanName", defaultString(testPlan.getName()),
                        "status", defaultString(testPlan.getStatus()),
                        "iterationId", testPlan.getIteration() == null ? "" : testPlan.getIteration().getId()
                ),
                List.of()
        );
    }

    private PlatformToolCandidate wikiPageCandidate(WikiSpacePageSummary page) {
        return new PlatformToolCandidate(
                "WIKI_PAGE",
                page.id(),
                page.title(),
                "空间：" + defaultString(page.spaceName()) + " / 版本：v" + page.currentVersionNumber(),
                "/wiki/spaces/" + page.spaceId() + "/pages/" + page.id(),
                Map.of(
                        "spaceId", page.spaceId(),
                        "pageId", page.id(),
                        "slug", defaultString(page.slug()),
                        "title", defaultString(page.title()),
                        "directoryId", page.directoryId(),
                        "boundProjectId", page.boundProjectId() == null ? "" : page.boundProjectId()
                ),
                List.of()
        );
    }

    private PlatformToolResult result(String toolCode,
                                      String toolName,
                                      String summary,
                                      List<PlatformToolCandidate> candidates,
                                      Map<String, Object> metadata) {
        return new PlatformToolResult(toolCode, toolName, summary, candidates, List.of(), metadata);
    }

    private void requireToolPermission(PlatformToolDefinition definition) {
        if (definition.permissionCode() == null || definition.permissionCode().isBlank()) {
            return;
        }
        boolean allowed = AuthContextHolder.get()
                .map(authContext -> authContext.hasPermission(definition.permissionCode()))
                .orElse(false);
        if (!allowed) {
            throw new ForbiddenException("无权调用平台工具: " + definition.code());
        }
    }

    private ProjectEntity requireVisibleProject(Long projectId) {
        ProjectEntity project = projectRepository.findById(projectId)
                .orElseThrow(() -> new NoSuchElementException("项目不存在: " + projectId));
        projectDataPermissionService.requireProjectVisible(project);
        return project;
    }

    private IterationEntity requireVisibleIteration(Long projectId, Long iterationId) {
        IterationEntity iteration = iterationRepository.findById(iterationId)
                .orElseThrow(() -> new NoSuchElementException("迭代不存在: " + iterationId));
        if (!Objects.equals(iteration.getProject().getId(), projectId)) {
            throw new IllegalArgumentException("迭代不属于当前项目: " + iterationId);
        }
        projectDataPermissionService.requireProjectVisible(iteration.getProject());
        return iteration;
    }

    private TaskEntity requireVisibleTask(Long taskId) {
        TaskEntity task = taskRepository.findById(taskId)
                .orElseThrow(() -> new NoSuchElementException("工作项不存在: " + taskId));
        projectDataPermissionService.requireTaskVisible(task);
        return task;
    }

    private boolean canSeeProject(ProjectEntity project) {
        try {
            projectDataPermissionService.requireProjectVisible(project);
            return true;
        } catch (RuntimeException exception) {
            return false;
        }
    }

    private boolean canSeeTask(TaskEntity task) {
        try {
            projectDataPermissionService.requireTaskVisible(task);
            return true;
        } catch (RuntimeException exception) {
            return false;
        }
    }

    private List<AgentEntity> availableAgents(Long projectId) {
        LinkedHashMap<Long, AgentEntity> result = new LinkedHashMap<>();
        agentRepository.findAllByEnabledTrueAndProjectIsNullOrderByIdAsc().forEach(agent -> result.put(agent.getId(), agent));
        if (projectId != null) {
            requireVisibleProject(projectId);
            agentRepository.findAllByProject_IdAndEnabledTrueOrderByIdAsc(projectId).forEach(agent -> result.put(agent.getId(), agent));
        }
        return new ArrayList<>(result.values());
    }

    private List<UserEntity> projectParticipants(ProjectEntity project) {
        LinkedHashSet<UserEntity> users = new LinkedHashSet<>();
        if (project.getOwnerUser() != null) {
            users.add(project.getOwnerUser());
        }
        if (project.getCreatorUser() != null) {
            users.add(project.getCreatorUser());
        }
        users.addAll(project.getMembers());
        return new ArrayList<>(users);
    }

    private Long longValue(Map<String, Object> payload, String key) {
        Long value = nullableLongValue(payload, key);
        if (value == null) {
            throw new IllegalArgumentException("工具参数缺少 " + key);
        }
        return value;
    }

    private Long nullableLongValue(Map<String, Object> payload, String key) {
        Object value = payload == null ? null : payload.get(key);
        if (value == null || String.valueOf(value).isBlank()) {
            return null;
        }
        if (value instanceof Number number) {
            return number.longValue();
        }
        return Long.parseLong(String.valueOf(value));
    }

    private String stringValue(Map<String, Object> payload, String key) {
        Object value = payload == null ? null : payload.get(key);
        return value == null ? "" : String.valueOf(value).trim();
    }

    private Integer nullableIntegerValue(Map<String, Object> payload, String key) {
        Object value = payload == null ? null : payload.get(key);
        if (value == null || String.valueOf(value).isBlank()) {
            return null;
        }
        if (value instanceof Number number) {
            return number.intValue();
        }
        return Integer.parseInt(String.valueOf(value));
    }

    private boolean containsAny(String value, String keyword) {
        if (value == null || keyword == null || keyword.isBlank()) {
            return false;
        }
        return value.toLowerCase(Locale.ROOT).contains(keyword.toLowerCase(Locale.ROOT));
    }

    /**
     * 仓库绑定搜索既要支持“纯仓库路径”，也要兼容“项目 + 仓库 + 动作”的整句自然语言。
     */
    private List<String> resolveGitlabBindingKeywords(String keyword) {
        if (isBlank(keyword)) {
            return List.of();
        }
        String normalized = keyword.trim();
        Set<String> candidates = new LinkedHashSet<>();
        candidates.add(normalized);

        Matcher matcher = GITLAB_PATH_PATTERN.matcher(normalized);
        while (matcher.find()) {
            String repositoryPath = matcher.group(1);
            if (repositoryPath == null || repositoryPath.isBlank()) {
                continue;
            }
            String trimmedPath = repositoryPath.trim();
            candidates.add(trimmedPath);
            String[] pathSegments = trimmedPath.split("/");
            if (pathSegments.length > 0) {
                candidates.add(pathSegments[pathSegments.length - 1].trim());
            }
        }

        String[] fragments = normalized.split("[\\s,，。；;：:()（）]+");
        for (String fragment : fragments) {
            if (fragment != null && fragment.trim().length() >= 3) {
                candidates.add(fragment.trim());
            }
        }
        return candidates.stream()
                .filter(item -> item != null && !item.isBlank())
                .toList();
    }

    /**
     * 构造允许空值被自动跳过的 metadata，避免可选查询参数在 `Map.of` 中触发空指针。
     */
    private Map<String, Object> metadata(Object... keyValues) {
        LinkedHashMap<String, Object> metadata = new LinkedHashMap<>();
        if (keyValues == null) {
            return Map.of();
        }
        for (int index = 0; index + 1 < keyValues.length; index += 2) {
            Object key = keyValues[index];
            Object value = keyValues[index + 1];
            if (!(key instanceof String keyName) || keyName.isBlank() || value == null) {
                continue;
            }
            metadata.put(keyName, value);
        }
        return metadata.isEmpty() ? Map.of() : Map.copyOf(metadata);
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }

    private long countWorkItemsByType(List<TaskEntity> tasks, String workItemType) {
        if (tasks == null || tasks.isEmpty()) {
            return 0L;
        }
        return tasks.stream()
                .filter(task -> workItemType.equals(defaultString(task.getWorkItemType())))
                .count();
    }

    private boolean isDeliveredStatus(String status) {
        String normalized = defaultString(status);
        return "已完成".equals(normalized)
                || "完成".equals(normalized)
                || "已上线".equals(normalized)
                || "已发布".equals(normalized)
                || "通过".equals(normalized)
                || "关闭".equals(normalized)
                || "DONE".equalsIgnoreCase(normalized)
                || "CLOSED".equalsIgnoreCase(normalized);
    }

    private String defaultString(String value) {
        return value == null ? "" : value.trim();
    }

    private String abbreviate(String value, int maxLength) {
        String normalized = defaultString(value);
        if (normalized.length() <= maxLength) {
            return normalized;
        }
        return normalized.substring(0, Math.max(0, maxLength - 3)) + "...";
    }

    private String displayName(UserEntity user) {
        if (user == null) {
            return "";
        }
        String nickname = defaultString(user.getNickname());
        return nickname.isBlank() ? defaultString(user.getUsername()) : nickname;
    }
}
