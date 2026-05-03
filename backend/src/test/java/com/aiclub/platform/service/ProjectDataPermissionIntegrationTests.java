package com.aiclub.platform.service;

import com.aiclub.platform.common.DataPermissionScopeType;
import com.aiclub.platform.domain.model.AgentEntity;
import com.aiclub.platform.domain.model.ExecutionRunEntity;
import com.aiclub.platform.domain.model.ExecutionTaskEntity;
import com.aiclub.platform.domain.model.GitlabAutoMergeConfigEntity;
import com.aiclub.platform.domain.model.GitlabAutoMergeLogEntity;
import com.aiclub.platform.domain.model.IterationEntity;
import com.aiclub.platform.domain.model.JenkinsServerEntity;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.ProjectGitlabBindingEntity;
import com.aiclub.platform.domain.model.ProjectPipelineBindingEntity;
import com.aiclub.platform.domain.model.RoleEntity;
import com.aiclub.platform.domain.model.TaskEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.IterationSummary;
import com.aiclub.platform.dto.ExecutionTaskListStatsSummary;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.ExecutionTaskSummary;
import com.aiclub.platform.dto.KnowledgeGraphSummary;
import com.aiclub.platform.dto.ProjectGitlabBindingSummary;
import com.aiclub.platform.dto.ProjectListStatsSummary;
import com.aiclub.platform.dto.ProjectPipelineBindingSummary;
import com.aiclub.platform.dto.ProjectSummary;
import com.aiclub.platform.dto.TaskSummary;
import com.aiclub.platform.dto.TestPlanSummary;
import com.aiclub.platform.dto.request.ProjectGitlabBindingRequest;
import com.aiclub.platform.dto.request.IterationRequest;
import com.aiclub.platform.dto.request.ProjectRequest;
import com.aiclub.platform.dto.request.TaskCommentRequest;
import com.aiclub.platform.dto.request.TaskRequirementAiRequest;
import com.aiclub.platform.dto.request.TaskRequest;
import com.aiclub.platform.dto.request.TestPlanRequest;
import com.aiclub.platform.exception.ForbiddenException;
import com.aiclub.platform.repository.AgentRepository;
import com.aiclub.platform.repository.ExecutionTaskRepository;
import com.aiclub.platform.repository.ExecutionRunRepository;
import com.aiclub.platform.repository.GitlabAutoMergeConfigRepository;
import com.aiclub.platform.repository.GitlabAutoMergeLogRepository;
import com.aiclub.platform.repository.IterationRepository;
import com.aiclub.platform.repository.JenkinsServerRepository;
import com.aiclub.platform.repository.ProjectGitlabBindingRepository;
import com.aiclub.platform.repository.ProjectPipelineBindingRepository;
import com.aiclub.platform.repository.ProjectRepository;
import com.aiclub.platform.repository.RoleRepository;
import com.aiclub.platform.repository.TaskRepository;
import com.aiclub.platform.repository.UserRepository;
import com.aiclub.platform.security.AuthContext;
import com.aiclub.platform.security.AuthContextHolder;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 覆盖项目级数据权限的核心集成场景，确保可见范围、删除限制和列表过滤按预期生效。
 */
@SpringBootTest
@Transactional
class ProjectDataPermissionIntegrationTests {

    @Autowired
    private PlatformStoreService platformStoreService;

    @Autowired
    private GitlabManagementService gitlabManagementService;

    @Autowired
    private CicdManagementService cicdManagementService;

    @Autowired
    private TaskAgentRunService taskAgentRunService;

    @Autowired
    private TaskRequirementAiService taskRequirementAiService;

    @Autowired
    private ExecutionTaskService executionTaskService;

    @Autowired
    private TestManagementService testManagementService;

    @Autowired
    private KnowledgeGraphService knowledgeGraphService;

    @Autowired
    private MemoryFactGraphService memoryFactGraphService;

    @Autowired
    private ProjectRepository projectRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private RoleRepository roleRepository;

    @Autowired
    private TaskRepository taskRepository;

    @Autowired
    private IterationRepository iterationRepository;

    @Autowired
    private AgentRepository agentRepository;

    @Autowired
    private ExecutionTaskRepository executionTaskRepository;

    @Autowired
    private ExecutionRunRepository executionRunRepository;

    @Autowired
    private ProjectGitlabBindingRepository projectGitlabBindingRepository;

    @Autowired
    private JenkinsServerRepository jenkinsServerRepository;

    @Autowired
    private ProjectPipelineBindingRepository projectPipelineBindingRepository;

    @Autowired
    private GitlabAutoMergeConfigRepository gitlabAutoMergeConfigRepository;

    @Autowired
    private GitlabAutoMergeLogRepository gitlabAutoMergeLogRepository;

    @AfterEach
    void clearAuthContext() {
        AuthContextHolder.clear();
    }

    /**
     * 创建项目时，创建人会自动并入项目成员，并立即拥有项目编辑删除能力。
     */
    @Test
    void shouldAddProjectCreatorIntoMembersAndAllowCreatorManageProject() {
        UserEntity creator = createUser("creator-a", "创建人A");
        UserEntity owner = createUser("owner-a", "负责人A");

        loginAs(creator);
        ProjectSummary summary = platformStoreService.createProject(new ProjectRequest(
                "数据权限项目A",
                "",
                owner.getId(),
                List.of(),
                "进行中",
                "校验项目创建人自动入成员"
        ));

        assertThat(summary.creatorUserId()).isEqualTo(creator.getId());
        assertThat(summary.memberUserIds()).contains(creator.getId());
        assertThat(summary.canEdit()).isTrue();
        assertThat(summary.canDelete()).isTrue();

        ProjectSummary updated = platformStoreService.updateProject(summary.id(), new ProjectRequest(
                "数据权限项目A-已更新",
                "",
                owner.getId(),
                List.of(),
                "进行中",
                "项目已更新"
        ));
        assertThat(updated.name()).isEqualTo("数据权限项目A-已更新");
    }

    /**
     * 项目成员可以查看并编辑迭代和工作项，但不能编辑项目，也不能删除非自己创建的迭代和工作项。
     */
    @Test
    void memberShouldViewAndEditWorkItemsButCannotDeleteOthersResources() {
        UserEntity creator = createUser("creator-b", "创建人B");
        UserEntity owner = createUser("owner-b", "负责人B");
        UserEntity member = createUser("member-b", "成员B");

        ProjectEntity project = createProjectAs(creator, owner, List.of(member), "项目B");
        IterationSummary iteration = createIterationAs(creator, project, "迭代B");
        TaskSummary task = createTaskAs(creator, project, iteration.id(), "工作项B", "任务");

        loginAs(member);
        assertThat(platformStoreService.getProject(project.getId()).id()).isEqualTo(project.getId());
        assertThat(platformStoreService.getIterationBoard(project.getId()).project().id()).isEqualTo(project.getId());
        assertThat(platformStoreService.getTask(task.id()).id()).isEqualTo(task.id());

        IterationSummary updatedIteration = platformStoreService.updateIteration(project.getId(), iteration.id(), new IterationRequest(
                "迭代B-成员编辑",
                iteration.goal(),
                iteration.status(),
                iteration.startDate(),
                iteration.endDate(),
                iteration.description(),
                iteration.sortOrder()
        ));
        assertThat(updatedIteration.name()).isEqualTo("迭代B-成员编辑");

        TaskSummary updatedTask = platformStoreService.updateTask(task.id(), buildTaskRequest(
                task,
                "处理中",
                member.getId(),
                List.of()
        ));
        assertThat(updatedTask.status()).isEqualTo("处理中");
        assertThat(updatedTask.assigneeUserId()).isEqualTo(member.getId());

        assertThatThrownBy(() -> platformStoreService.updateProject(project.getId(), new ProjectRequest(
                "项目B-非法编辑",
                "",
                owner.getId(),
                List.of(member.getId()),
                "进行中",
                "成员不能编辑项目"
        ))).isInstanceOf(ForbiddenException.class);
        assertThatThrownBy(() -> platformStoreService.deleteProject(project.getId())).isInstanceOf(ForbiddenException.class);
        assertThatThrownBy(() -> platformStoreService.deleteIteration(project.getId(), iteration.id())).isInstanceOf(ForbiddenException.class);
        assertThatThrownBy(() -> platformStoreService.deleteTask(task.id())).isInstanceOf(ForbiddenException.class);
    }

    /**
     * 迭代和工作项的创建人可以删除自己创建的数据。
     */
    @Test
    void creatorShouldDeleteOwnIterationAndTask() {
        UserEntity creator = createUser("creator-c", "创建人C");
        UserEntity owner = createUser("owner-c", "负责人C");

        ProjectEntity project = createProjectAs(creator, owner, List.of(), "项目C");
        IterationSummary iteration = createIterationAs(creator, project, "迭代C");
        TaskSummary task = createTaskAs(creator, project, iteration.id(), "工作项C", "任务");

        loginAs(creator);
        platformStoreService.deleteTask(task.id());
        assertThat(taskRepository.findById(task.id())).isEmpty();

        platformStoreService.deleteIteration(project.getId(), iteration.id());
        assertThat(iterationRepository.findById(iteration.id())).isEmpty();
    }

    /**
     * 非项目成员不能访问项目详情、工作项详情及其子服务接口。
     */
    @Test
    void outsiderShouldBeBlockedFromProjectDataAndTaskSubServices() {
        UserEntity creator = createUser("creator-d", "创建人D");
        UserEntity owner = createUser("owner-d", "负责人D");
        UserEntity outsider = createUser("outsider-d", "旁观者D");

        ProjectEntity project = createProjectAs(creator, owner, List.of(), "项目D");
        TaskSummary requirementTask = createTaskAs(creator, project, null, "需求D", "需求");

        loginAs(creator);
        platformStoreService.createTaskComment(requirementTask.id(), new TaskCommentRequest("这是一个评论"));

        loginAs(outsider);
        assertThatThrownBy(() -> platformStoreService.getProject(project.getId())).isInstanceOf(ForbiddenException.class);
        assertThatThrownBy(() -> platformStoreService.listProjectWorkItems(project.getId(), null, null, null, null)).isInstanceOf(ForbiddenException.class);
        assertThatThrownBy(() -> platformStoreService.getTask(requirementTask.id())).isInstanceOf(ForbiddenException.class);
        assertThatThrownBy(() -> platformStoreService.listTaskComments(requirementTask.id())).isInstanceOf(ForbiddenException.class);
        assertThatThrownBy(() -> taskAgentRunService.listRecentRuns(requirementTask.id())).isInstanceOf(ForbiddenException.class);
        assertThatThrownBy(() -> taskRequirementAiService.generate(requirementTask.id(), new TaskRequirementAiRequest("STANDARDIZE", null)))
                .isInstanceOf(ForbiddenException.class);
    }

    /**
     * 项目相关列表只返回当前用户可见项目的数据，独立自动合并配置和日志继续作为全局数据可见。
     */
    @Test
    void shouldFilterProjectRelatedListsByMembershipAndKeepStandaloneGitlabData() {
        UserEntity visibleCreator = createUser("creator-e1", "创建人E1");
        UserEntity hiddenCreator = createUser("creator-e2", "创建人E2");
        UserEntity owner = createUser("owner-e", "负责人E");
        UserEntity viewer = createUser("viewer-e", "成员E");

        ProjectEntity visibleProject = createProjectAs(visibleCreator, owner, List.of(viewer), "可见项目E");
        ProjectEntity hiddenProject = createProjectAs(hiddenCreator, owner, List.of(), "隐藏项目E");

        createTaskAs(visibleCreator, visibleProject, null, "可见任务E", "任务");
        createTaskAs(hiddenCreator, hiddenProject, null, "隐藏任务E", "任务");

        agentRepository.save(createProjectAgent("全局智能体E", null));
        agentRepository.save(createProjectAgent("可见智能体E", visibleProject));
        agentRepository.save(createProjectAgent("隐藏智能体E", hiddenProject));

        ProjectGitlabBindingEntity visibleBinding = projectGitlabBindingRepository.save(createGitlabBinding("visible/repo", visibleProject));
        ProjectGitlabBindingEntity hiddenBinding = projectGitlabBindingRepository.save(createGitlabBinding("hidden/repo", hiddenProject));

        JenkinsServerEntity jenkinsServer = jenkinsServerRepository.save(createJenkinsServer("共享JenkinsE"));
        projectPipelineBindingRepository.save(createPipelineBinding(visibleProject, jenkinsServer, "visible-job"));
        projectPipelineBindingRepository.save(createPipelineBinding(hiddenProject, jenkinsServer, "hidden-job"));

        GitlabAutoMergeConfigEntity visibleProjectConfig = gitlabAutoMergeConfigRepository.save(createProjectBoundConfig("可见策略E", visibleBinding));
        GitlabAutoMergeConfigEntity hiddenProjectConfig = gitlabAutoMergeConfigRepository.save(createProjectBoundConfig("隐藏策略E", hiddenBinding));
        GitlabAutoMergeConfigEntity standaloneConfig = gitlabAutoMergeConfigRepository.save(createStandaloneConfig("独立策略E"));

        gitlabAutoMergeLogRepository.save(createAutoMergeLog(visibleProjectConfig, visibleProject, "可见日志E"));
        gitlabAutoMergeLogRepository.save(createAutoMergeLog(hiddenProjectConfig, hiddenProject, "隐藏日志E"));
        gitlabAutoMergeLogRepository.save(createAutoMergeLog(standaloneConfig, null, "独立日志E"));

        loginAs(viewer);

        assertThat(platformStoreService.pageProjects(1, 20, null, null).records())
                .extracting(ProjectSummary::name)
                .containsExactly("可见项目E");
        assertThat(platformStoreService.pageTasks(1, 20, null, null, null, null, null).records())
                .extracting(TaskSummary::name)
                .containsExactly("可见任务E");
        assertThat(platformStoreService.pageAgents(1, 20, null, null, null, null, null).records())
                .extracting(com.aiclub.platform.dto.AgentSummary::name)
                .containsExactlyInAnyOrder("全局智能体E", "可见智能体E");

        PageResponse<ProjectGitlabBindingSummary> bindingPage = gitlabManagementService.pageBindings(1, 20, null, null);
        assertThat(bindingPage.records())
                .extracting(ProjectGitlabBindingSummary::projectName)
                .containsExactly("可见项目E");

        PageResponse<ProjectPipelineBindingSummary> pipelinePage = cicdManagementService.pagePipelineBindings(1, 20, null, null, null);
        assertThat(pipelinePage.records())
                .extracting(ProjectPipelineBindingSummary::projectName)
                .containsExactly("可见项目E");

        assertThat(gitlabManagementService.pageAutoMergeConfigs(1, 20, null, null, null).records())
                .extracting(com.aiclub.platform.dto.GitlabAutoMergeConfigSummary::name)
                .containsExactlyInAnyOrder("可见策略E", "独立策略E");
        assertThat(gitlabManagementService.pageAutoMergeLogs(1, 20, null, null, null).records())
                .extracting(com.aiclub.platform.dto.GitlabAutoMergeLogSummary::reason)
                .containsExactlyInAnyOrder("可见日志E", "独立日志E");
    }

    /**
     * 负责人和协作人必须属于项目负责人、创建人或项目成员。
     */
    @Test
    void shouldRejectAssigneeOrCollaboratorOutsideProjectParticipants() {
        UserEntity creator = createUser("creator-f", "创建人F");
        UserEntity owner = createUser("owner-f", "负责人F");
        UserEntity member = createUser("member-f", "成员F");
        UserEntity outsider = createUser("outsider-f", "旁观者F");

        ProjectEntity project = createProjectAs(creator, owner, List.of(member), "项目F");

        loginAs(creator);
        assertThatThrownBy(() -> platformStoreService.createTask(new TaskRequest(
                "非法负责人任务",
                "任务",
                "待开始",
                "中",
                "",
                outsider.getId(),
                List.of(),
                "校验非法负责人",
                "",
                "",
                "",
                false,
                false,
                null,
                null,
                null,
                project.getId(),
                null,
                null,
                null
        ))).isInstanceOf(IllegalArgumentException.class)
                .hasMessage("负责人必须属于当前项目负责人或项目成员");

        TaskSummary task = createTaskAs(creator, project, null, "合法任务F", "任务");
        assertThatThrownBy(() -> platformStoreService.updateTask(task.id(), buildTaskRequest(
                task,
                task.status(),
                member.getId(),
                List.of(outsider.getId())
        ))).isInstanceOf(IllegalArgumentException.class)
                .hasMessage("协作人必须属于当前项目负责人或项目成员");
    }

    /**
     * 角色上的数据权限范围一旦修改，应在下一次请求立即生效，不要求用户重新登录。
     */
    @Test
    void rolePolicyChangeShouldTakeEffectOnNextRequest() {
        UserEntity creator = createUser("creator-g", "创建人G");
        UserEntity owner = createUser("owner-g", "负责人G");
        UserEntity member = createUser("member-g", "成员G");

        ProjectEntity project = createProjectAs(creator, owner, List.of(member), "项目G");

        loginAs(member);
        assertThat(platformStoreService.getProject(project.getId()).id()).isEqualTo(project.getId());

        RoleEntity memberRole = member.getRoles().stream().findFirst().orElseThrow();
        memberRole.setProjectVisibilityScope(DataPermissionScopeType.NONE);
        roleRepository.save(memberRole);

        assertThatThrownBy(() -> platformStoreService.getProject(project.getId()))
                .isInstanceOf(ForbiddenException.class);
    }

    /**
     * 多角色的数据权限按并集生效，角色组合后应得到更宽的最终访问能力。
     */
    @Test
    void multipleRolesShouldMergeDataScopesByUnion() {
        RoleEntity ownerOnlyRole = createRole(
                "ROLE_OWNER_ONLY",
                DataPermissionScopeType.PROJECT_PARTICIPANT,
                DataPermissionScopeType.OWNER_ONLY,
                DataPermissionScopeType.NONE,
                DataPermissionScopeType.NONE
        );
        RoleEntity creatorOnlyRole = createRole(
                "ROLE_CREATOR_ONLY",
                DataPermissionScopeType.PROJECT_PARTICIPANT,
                DataPermissionScopeType.CREATOR_ONLY,
                DataPermissionScopeType.NONE,
                DataPermissionScopeType.NONE
        );

        UserEntity creator = createUser("creator-h", "创建人H", List.of(ownerOnlyRole, creatorOnlyRole));
        UserEntity owner = createUser("owner-h", "负责人H");

        ProjectEntity project = createProjectAs(creator, owner, List.of(), "项目H");

        loginAs(creator);
        ProjectSummary updated = platformStoreService.updateProject(project.getId(), new ProjectRequest(
                "项目H-并集生效",
                "",
                owner.getId(),
                List.of(),
                "进行中",
                "多角色并集应允许创建人维护项目"
        ));
        assertThat(updated.name()).isEqualTo("项目H-并集生效");
    }

    /**
     * 当角色将项目可见范围配置为所有人时，项目管理列表应返回非本人参与的项目。
     */
    @Test
    void projectListShouldRespectAllVisibilityScope() {
        RoleEntity allVisibilityRole = createRole(
                "ROLE_ALL_VISIBILITY",
                DataPermissionScopeType.ALL,
                DataPermissionScopeType.NONE,
                DataPermissionScopeType.NONE,
                DataPermissionScopeType.NONE
        );

        UserEntity viewer = createUser("viewer-i", "查看者I", List.of(allVisibilityRole));
        UserEntity creatorA = createUser("creator-i1", "创建人I1");
        UserEntity creatorB = createUser("creator-i2", "创建人I2");
        UserEntity owner = createUser("owner-i", "负责人I");

        createProjectAs(creatorA, owner, List.of(), "项目I-A");
        createProjectAs(creatorB, owner, List.of(), "项目I-B");

        loginAs(viewer);
        assertThat(platformStoreService.pageProjects(1, 20, null, null).records())
                .extracting(ProjectSummary::name)
                .containsExactlyInAnyOrder("项目I-A", "项目I-B");
    }

    /**
     * 项目绑定资源不再单独扩数据权限字段，而是统一跟随项目可见范围：
     * 项目成员既能创建项目下的 GitLab 绑定，也能查看执行中心中的项目任务；
     * 非项目成员则会在服务端被拒绝。
     */
    @Test
    void projectParticipantShouldAccessProjectBoundGitlabAndExecutionResources() {
        UserEntity creator = createUser("creator-j", "创建人J");
        UserEntity owner = createUser("owner-j", "负责人J");
        UserEntity member = createUser("member-j", "成员J");
        UserEntity outsider = createUser("outsider-j", "旁观者J");

        ProjectEntity visibleProject = createProjectAs(creator, owner, List.of(member), "可见项目J");
        ProjectEntity hiddenProject = createProjectAs(creator, owner, List.of(), "隐藏项目J");
        ExecutionTaskEntity visibleExecutionTask = createExecutionTask(visibleProject, creator, "可见执行任务J");
        ExecutionTaskEntity hiddenExecutionTask = createExecutionTask(hiddenProject, creator, "隐藏执行任务J");

        loginAs(member);
        ProjectGitlabBindingSummary createdBinding = gitlabManagementService.createBinding(new ProjectGitlabBindingRequest(
                visibleProject.getId(),
                "http://gitlab.example.com/api/v4",
                "visible/project-j",
                "main",
                "main",
                "[]",
                "member-visible-token",
                true
        ));
        assertThat(createdBinding.projectId()).isEqualTo(visibleProject.getId());
        assertThat(createdBinding.projectName()).isEqualTo("可见项目J");

        PageResponse<ExecutionTaskSummary> executionTaskPage = executionTaskService.pageExecutionTasks(1, 20, null, null, null, null);
        assertThat(executionTaskPage.records())
                .extracting(ExecutionTaskSummary::title)
                .contains("可见执行任务J")
                .doesNotContain("隐藏执行任务J");
        assertThat(executionTaskService.getExecutionTask(visibleExecutionTask.getId()).id()).isEqualTo(visibleExecutionTask.getId());
        assertThatThrownBy(() -> executionTaskService.getExecutionTask(hiddenExecutionTask.getId()))
                .isInstanceOf(ForbiddenException.class);

        loginAs(outsider);
        assertThatThrownBy(() -> gitlabManagementService.createBinding(new ProjectGitlabBindingRequest(
                visibleProject.getId(),
                "http://gitlab.example.com/api/v4",
                "visible/project-j-outsider",
                "main",
                "main",
                "[]",
                "outsider-visible-token",
                true
        ))).isInstanceOf(ForbiddenException.class);
        assertThatThrownBy(() -> executionTaskService.getExecutionTask(visibleExecutionTask.getId()))
                .isInstanceOf(ForbiddenException.class);
    }

    /**
     * 项目管理顶部统计卡片必须基于完整筛选结果聚合，不能继续随着列表分页只统计当前页。
     */
    @Test
    void shouldSummarizeProjectCardsAcrossAllFilteredProjectsInsteadOfCurrentPage() {
        UserEntity creator = createUser("creator-project-summary", "项目统计创建人");
        UserEntity owner = createUser("owner-project-summary", "项目统计负责人");

        ProjectEntity runningProject = createProjectAs(creator, owner, List.of(), "项目统计-进行中");
        ProjectEntity plannedProject = createProjectAs(creator, owner, List.of(), "项目统计-已立项");
        plannedProject.setStatus("已立项");
        plannedProject = projectRepository.save(plannedProject);

        createTaskAs(creator, runningProject, null, "项目统计任务-1", "任务");
        createTaskAs(creator, runningProject, null, "项目统计任务-2", "任务");
        createTaskAs(creator, plannedProject, null, "项目统计任务-3", "任务");
        createTaskAs(creator, plannedProject, null, "项目统计任务-4", "任务");
        createTaskAs(creator, plannedProject, null, "项目统计任务-5", "任务");

        loginAs(creator);
        assertThat(platformStoreService.pageProjects(1, 1, null, null).records()).hasSize(1);

        ProjectListStatsSummary stats = platformStoreService.getProjectListStats(null, null);
        assertThat(stats.activeProjectCount()).isEqualTo(2);
        assertThat(stats.totalTaskCount()).isEqualTo(5);
        assertThat(stats.resourceLoadPercent()).isEqualTo(50);
        assertThat(stats.averageTaskCount()).isEqualTo(2.5D);
    }

    /**
     * 执行中心顶部统计卡片也必须按完整筛选结果聚合，避免翻页后进行中数量和平均进度失真。
     */
    @Test
    void shouldSummarizeExecutionCardsAcrossAllFilteredTasksInsteadOfCurrentPage() {
        UserEntity creator = createUser("creator-execution-summary", "执行统计创建人");
        UserEntity owner = createUser("owner-execution-summary", "执行统计负责人");

        ProjectEntity project = createProjectAs(creator, owner, List.of(), "执行统计项目");
        createExecutionTask(project, creator, "执行统计-待执行", "PENDING", 0);
        createExecutionTask(project, creator, "执行统计-待确认", "WAITING_CONFIRMATION", 50);
        createExecutionTask(project, creator, "执行统计-成功", "SUCCESS", 100);
        createExecutionTask(project, creator, "执行统计-失败", "FAILED", 0);

        loginAs(creator);
        assertThat(executionTaskService.pageExecutionTasks(1, 1, null, null, null, project.getId()).records()).hasSize(1);

        ExecutionTaskListStatsSummary stats = executionTaskService.getExecutionTaskListStats(null, null, null, project.getId());
        assertThat(stats.totalCount()).isEqualTo(4);
        assertThat(stats.pendingOrRunningCount()).isEqualTo(2);
        assertThat(stats.successCount()).isEqualTo(1);
        assertThat(stats.averageProgressPercent()).isEqualTo(38);
    }

    /**
     * 测试管理属于项目绑定资源：
     * 列表、详情、项目迭代选项以及新增入口都应继续跟随项目数据权限过滤。
     */
    @Test
    void shouldFilterAndProtectTestPlansByProjectVisibility() {
        UserEntity creator = createUser("creator-k", "创建人K");
        UserEntity owner = createUser("owner-k", "负责人K");
        UserEntity member = createUser("member-k", "成员K");

        ProjectEntity visibleProject = createProjectAs(creator, owner, List.of(member), "可见项目K");
        ProjectEntity hiddenProject = createProjectAs(creator, owner, List.of(), "隐藏项目K");
        IterationSummary visibleIteration = createIterationAs(creator, visibleProject, "可见迭代K");
        IterationSummary hiddenIteration = createIterationAs(creator, hiddenProject, "隐藏迭代K");
        TestPlanSummary visiblePlan = createTestPlanAs(creator, visibleProject, visibleIteration.id(), "可见测试计划K");
        TestPlanSummary hiddenPlan = createTestPlanAs(creator, hiddenProject, hiddenIteration.id(), "隐藏测试计划K");

        loginAs(member);
        assertThat(testManagementService.pageTestPlans(1, 20, null, null, null, null).records())
                .extracting(TestPlanSummary::name)
                .containsExactly("可见测试计划K");
        assertThat(testManagementService.getTestPlan(visiblePlan.id()).id()).isEqualTo(visiblePlan.id());
        assertThat(testManagementService.listProjectIterationOptions(visibleProject.getId()))
                .extracting(IterationSummary::id)
                .containsExactly(visibleIteration.id());

        assertThatThrownBy(() -> testManagementService.pageTestPlans(1, 20, null, hiddenProject.getId(), null, null))
                .isInstanceOf(ForbiddenException.class);
        assertThatThrownBy(() -> testManagementService.getTestPlan(hiddenPlan.id()))
                .isInstanceOf(ForbiddenException.class);
        assertThatThrownBy(() -> testManagementService.listProjectIterationOptions(hiddenProject.getId()))
                .isInstanceOf(ForbiddenException.class);
        assertThatThrownBy(() -> testManagementService.createTestPlan(buildTestPlanRequest(hiddenProject.getId(), hiddenIteration.id(), "非法测试计划K")))
                .isInstanceOf(ForbiddenException.class);
    }

    /**
     * 逻辑图谱和记忆事实图都属于项目级知识视图，
     * 拿到 `project:view` 后仍需再过一层项目数据权限校验，避免跨项目越权查看。
     */
    @Test
    void shouldProtectKnowledgeAndMemoryGraphsByProjectVisibility() {
        UserEntity creator = createUser("creator-l", "创建人L");
        UserEntity owner = createUser("owner-l", "负责人L");
        UserEntity member = createUser("member-l", "成员L");

        ProjectEntity visibleProject = createProjectAs(creator, owner, List.of(member), "可见项目L");
        ProjectEntity hiddenProject = createProjectAs(creator, owner, List.of(), "隐藏项目L");

        loginAs(member);
        KnowledgeGraphSummary visibleGraph = knowledgeGraphService.getProjectGraph(visibleProject.getId(), true);
        assertThat(visibleGraph.projectId()).isEqualTo(visibleProject.getId());
        assertThatThrownBy(() -> knowledgeGraphService.getProjectGraph(hiddenProject.getId(), false))
                .isInstanceOf(ForbiddenException.class);
        assertThatThrownBy(() -> knowledgeGraphService.rebuildProjectGraph(hiddenProject.getId()))
                .isInstanceOf(ForbiddenException.class);
        assertThatThrownBy(() -> memoryFactGraphService.getProjectGraph(hiddenProject.getId()))
                .isInstanceOf(ForbiddenException.class);
        assertThatThrownBy(() -> memoryFactGraphService.getFacts(hiddenProject.getId(), null, null, "隐藏项目", 5))
                .isInstanceOf(ForbiddenException.class);
        assertThatThrownBy(() -> memoryFactGraphService.getEntityDetail(
                hiddenProject.getId(),
                "git-ai-club:wiki:project:" + hiddenProject.getId() + "::entity-hidden"
        )).isInstanceOf(ForbiddenException.class);
    }

    private UserEntity createUser(String username, String nickname) {
        RoleEntity defaultRole = createRole(
                "ROLE_" + username.toUpperCase(),
                DataPermissionScopeType.PROJECT_PARTICIPANT,
                DataPermissionScopeType.OWNER_OR_CREATOR,
                DataPermissionScopeType.CREATOR_ONLY,
                DataPermissionScopeType.CREATOR_ONLY
        );
        return createUser(username, nickname, List.of(defaultRole));
    }

    private UserEntity createUser(String username, String nickname, List<RoleEntity> roles) {
        UserEntity user = new UserEntity();
        user.setUsername(username);
        user.setNickname(nickname);
        user.setPasswordHash("test-password-hash");
        user.setEnabled(true);
        user.setRoles(new java.util.LinkedHashSet<>(roles));
        return userRepository.save(user);
    }

    private void loginAs(UserEntity user) {
        AuthContextHolder.set(new AuthContext(
                user.getId(),
                user.getUsername(),
                user.getNickname(),
                user.getRoles().stream().map(RoleEntity::getCode).collect(Collectors.toSet()),
                Set.of()
        ));
    }

    private RoleEntity createRole(String code,
                                  DataPermissionScopeType projectVisibilityScope,
                                  DataPermissionScopeType projectManageScope,
                                  DataPermissionScopeType iterationDeleteScope,
                                  DataPermissionScopeType taskDeleteScope) {
        RoleEntity role = new RoleEntity();
        role.setName(code);
        role.setCode(code);
        role.setEnabled(true);
        role.setDescription(code + " 描述");
        role.setProjectVisibilityScope(projectVisibilityScope);
        role.setProjectManageScope(projectManageScope);
        role.setIterationDeleteScope(iterationDeleteScope);
        role.setTaskDeleteScope(taskDeleteScope);
        return roleRepository.save(role);
    }

    private ProjectEntity createProjectAs(UserEntity creator, UserEntity owner, List<UserEntity> members, String name) {
        loginAs(creator);
        ProjectSummary summary = platformStoreService.createProject(new ProjectRequest(
                name,
                "",
                owner.getId(),
                members.stream().map(UserEntity::getId).toList(),
                "进行中",
                name + " 的描述"
        ));
        return projectRepository.findById(summary.id()).orElseThrow();
    }

    private IterationSummary createIterationAs(UserEntity creator, ProjectEntity project, String name) {
        loginAs(creator);
        return platformStoreService.createIteration(project.getId(), new IterationRequest(
                name,
                name + " 的目标",
                "进行中",
                "2026-04-01",
                "2026-04-30",
                name + " 的描述",
                1
        ));
    }

    private TaskSummary createTaskAs(UserEntity creator, ProjectEntity project, Long iterationId, String name, String workItemType) {
        loginAs(creator);
        String requirementMarkdown = """
                ## 用户故事

                作为项目成员，我希望查看当前需求。

                ## 需求描述

                需要展示 %s 的详情内容。

                ## 验收标准

                1. 能正常打开页面。
                2. 页面内容完整显示。
                """.formatted(name);
        return platformStoreService.createTask(new TaskRequest(
                name,
                workItemType,
                "草稿",
                "中",
                "",
                null,
                List.of(),
                name + " 的描述",
                "需求".equals(workItemType) ? requirementMarkdown : "",
                "需求".equals(workItemType) ? "https://prototype.example.com/" + name : "",
                "需求".equals(workItemType) ? "默认模块" : "",
                false,
                false,
                null,
                null,
                null,
                project.getId(),
                null,
                iterationId,
                null
        ));
    }

    private TaskRequest buildTaskRequest(TaskSummary task, String status, Long assigneeUserId, List<Long> collaboratorUserIds) {
        return new TaskRequest(
                task.name(),
                task.workItemType(),
                status,
                task.priority(),
                task.assignee(),
                assigneeUserId,
                collaboratorUserIds,
                task.description(),
                task.requirementMarkdown(),
                task.prototypeUrl(),
                task.moduleName(),
                task.devPassed(),
                task.testPassed(),
                task.workHours(),
                task.planStartDate(),
                task.planEndDate(),
                task.projectId(),
                task.agentId(),
                task.iterationId(),
                task.requirementTaskId()
        );
    }

    private TestPlanSummary createTestPlanAs(UserEntity creator, ProjectEntity project, Long iterationId, String name) {
        loginAs(creator);
        return testManagementService.createTestPlan(buildTestPlanRequest(project.getId(), iterationId, name));
    }

    private TestPlanRequest buildTestPlanRequest(Long projectId, Long iterationId, String name) {
        return new TestPlanRequest(
                name,
                projectId,
                iterationId,
                "草稿",
                name + " 的描述",
                null,
                null,
                null,
                null,
                List.of()
        );
    }

    private AgentEntity createProjectAgent(String name, ProjectEntity project) {
        AgentEntity agent = new AgentEntity(name, "开发", "在线", name + " 的能力", project);
        agent.setEnabled(true);
        agent.setDescription(name + " 的描述");
        return agent;
    }

    private ProjectGitlabBindingEntity createGitlabBinding(String projectRef, ProjectEntity project) {
        ProjectGitlabBindingEntity binding = new ProjectGitlabBindingEntity();
        binding.setProject(project);
        binding.setApiBaseUrl("http://gitlab.example.com/api/v4");
        binding.setGitlabProjectRef(projectRef);
        binding.setTokenCiphertext("encrypted-token");
        binding.setEnabled(true);
        return binding;
    }

    private ExecutionTaskEntity createExecutionTask(ProjectEntity project, UserEntity createdByUser, String title) {
        return createExecutionTask(project, createdByUser, title, "PENDING", 0);
    }

    private ExecutionTaskEntity createExecutionTask(ProjectEntity project,
                                                    UserEntity createdByUser,
                                                    String title,
                                                    String status,
                                                    int progressPercent) {
        ExecutionTaskEntity entity = new ExecutionTaskEntity();
        entity.setSourceType("MANUAL");
        entity.setSourceId(null);
        entity.setTriggerSource("PAGE");
        entity.setScenarioCode(ExecutionWorkflowService.SCENARIO_AD_HOC_AGENT_RUN);
        entity.setTitle(title);
        entity.setProject(project);
        entity.setCreatedByUser(createdByUser);
        entity.setStatus(status);
        entity.setCancelRequested(false);
        entity.setLatestSummary(title + " 的摘要");
        entity.setInputPayload("{}");
        entity.setAgentBindingPayload("[]");
        entity = executionTaskRepository.save(entity);

        ExecutionRunEntity run = new ExecutionRunEntity();
        run.setExecutionTask(entity);
        run.setRunNo(1);
        run.setStatus(status);
        run.setProgressPercent(progressPercent);
        run.setInputSnapshot("{}");
        run = executionRunRepository.save(run);

        entity.setCurrentRun(run);
        return executionTaskRepository.save(entity);
    }

    private JenkinsServerEntity createJenkinsServer(String name) {
        JenkinsServerEntity server = new JenkinsServerEntity();
        server.setName(name);
        server.setBaseUrl("http://jenkins.example.com");
        server.setUsername("tester");
        server.setTokenCiphertext("encrypted-token");
        server.setDescription(name + " 描述");
        server.setEnabled(true);
        return server;
    }

    private ProjectPipelineBindingEntity createPipelineBinding(ProjectEntity project, JenkinsServerEntity server, String jobName) {
        ProjectPipelineBindingEntity binding = new ProjectPipelineBindingEntity();
        binding.setProject(project);
        binding.setJenkinsServer(server);
        binding.setJobName(jobName);
        binding.setJobUrl("http://jenkins.example.com/job/" + jobName);
        binding.setEnabled(true);
        return binding;
    }

    private GitlabAutoMergeConfigEntity createProjectBoundConfig(String name, ProjectGitlabBindingEntity binding) {
        GitlabAutoMergeConfigEntity config = new GitlabAutoMergeConfigEntity();
        config.setName(name);
        config.setExecutionMode("PROJECT_BOUND");
        config.setDescription(name + " 描述");
        config.setBinding(binding);
        config.setEnabled(true);
        config.setAutoMerge(true);
        config.setRemoveSourceBranch(true);
        config.setRequirePipelineSuccess(true);
        return config;
    }

    private GitlabAutoMergeConfigEntity createStandaloneConfig(String name) {
        GitlabAutoMergeConfigEntity config = new GitlabAutoMergeConfigEntity();
        config.setName(name);
        config.setExecutionMode("STANDALONE");
        config.setDescription(name + " 描述");
        config.setApiBaseUrl("http://gitlab.example.com/api/v4");
        config.setGitlabProjectRef("standalone/" + name);
        config.setTokenCiphertext("encrypted-token");
        config.setEnabled(true);
        config.setAutoMerge(true);
        config.setRemoveSourceBranch(true);
        config.setRequirePipelineSuccess(true);
        return config;
    }

    private GitlabAutoMergeLogEntity createAutoMergeLog(GitlabAutoMergeConfigEntity config, ProjectEntity project, String reason) {
        GitlabAutoMergeLogEntity log = new GitlabAutoMergeLogEntity();
        log.setConfig(config);
        log.setProject(project);
        log.setConfigName(config.getName());
        log.setTriggerType("MANUAL");
        log.setResult("SKIPPED");
        log.setReason(reason);
        log.setExecutedAt(LocalDateTime.now());
        return log;
    }
}
