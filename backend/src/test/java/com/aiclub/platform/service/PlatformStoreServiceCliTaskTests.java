package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.AiModelConfigEntity;
import com.aiclub.platform.domain.model.AgentEntity;
import com.aiclub.platform.domain.model.IterationEntity;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.TaskEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.cli.CliDtos;
import com.aiclub.platform.repository.AgentRepository;
import com.aiclub.platform.repository.AiModelConfigRepository;
import com.aiclub.platform.repository.IterationRepository;
import com.aiclub.platform.repository.ProjectGitlabBindingRepository;
import com.aiclub.platform.repository.ProjectRepository;
import com.aiclub.platform.repository.TaskCommentRepository;
import com.aiclub.platform.repository.TaskGiteeBindingRepository;
import com.aiclub.platform.repository.TaskPrdProjectionRepository;
import com.aiclub.platform.repository.TaskRepository;
import com.aiclub.platform.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.jpa.domain.Specification;

import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * 验证 GitPilot CLI /requirement 命令对应的查询方法：
 * 1. 需求工作项被正确映射为精简的 CliTaskSummary；
 * 2. 查询绕过项目参与人可见性（不依赖 ProjectDataPermissionService），保证“分配给我但未参与的项目”需求可见。
 */
@ExtendWith(MockitoExtension.class)
class PlatformStoreServiceCliTaskTests {

    @Mock
    private ProjectRepository projectRepository;
    @Mock
    private ProjectGitlabBindingRepository projectGitlabBindingRepository;
    @Mock
    private AgentRepository agentRepository;
    @Mock
    private AiModelConfigRepository aiModelConfigRepository;
    @Mock
    private IterationRepository iterationRepository;
    @Mock
    private TaskRepository taskRepository;
    @Mock
    private TaskGiteeBindingRepository taskGiteeBindingRepository;
    @Mock
    private TaskCommentRepository taskCommentRepository;
    @Mock
    private TaskPrdProjectionRepository taskPrdProjectionRepository;
    @Mock
    private UserRepository userRepository;
    @Mock
    private TokenCipherService tokenCipherService;
    @Mock
    private TaskNotificationService taskNotificationService;
    @Mock
    private KnowledgeGraphService knowledgeGraphService;
    @Mock
    private ProjectDataPermissionService projectDataPermissionService;
    @Mock
    private RequirementModuleOptionService requirementModuleOptionService;
    @Mock
    private TaskPrdService taskPrdService;
    @Mock
    private DashboardShortcutEntryService dashboardShortcutEntryService;
    @Mock
    private GitlabUserOauthService gitlabUserOauthService;
    @Mock
    private GitlabManagementService gitlabManagementService;

    private PlatformStoreService platformStoreService;

    @BeforeEach
    void setUp() {
        platformStoreService = new PlatformStoreService(
                projectRepository,
                projectGitlabBindingRepository,
                agentRepository,
                aiModelConfigRepository,
                iterationRepository,
                taskRepository,
                taskGiteeBindingRepository,
                taskCommentRepository,
                taskPrdProjectionRepository,
                userRepository,
                tokenCipherService,
                taskNotificationService,
                knowledgeGraphService,
                projectDataPermissionService,
                requirementModuleOptionService,
                taskPrdService,
                dashboardShortcutEntryService,
                gitlabUserOauthService,
                gitlabManagementService
        );
    }

    /** 需求工作项映射为 CliTaskSummary，字段对应正确且 taskType 为 null（仅“任务”类型才返回 taskType）。 */
    @Test
    void shouldMapMyRequirementTaskToCliSummaryAndBypassProjectVisibility() {
        UserEntity me = new UserEntity();
        me.setId(7L);
        ProjectEntity project = new ProjectEntity();
        project.setId(5L);
        project.setName("AI Club 平台");
        IterationEntity iteration = new IterationEntity();
        iteration.setId(9L);
        iteration.setName("迭代一");

        TaskEntity task = new TaskEntity();
        task.setId(101L);
        task.setWorkItemCode("#ABC123");
        task.setName("登录支持验证码");
        task.setWorkItemType("需求");
        task.setStatus("进行中");
        task.setPriority("高");
        task.setAssignee("张三");
        task.setAssigneeUser(me);
        task.setProject(project);
        task.setIteration(iteration);
        task.setPlanStartDate(LocalDate.of(2026, 1, 1));
        task.setPlanEndDate(LocalDate.of(2026, 2, 1));
        task.setRequirementMarkdown("## 用户故事\n作为用户我希望用验证码登录");

        Page<TaskEntity> page = new PageImpl<>(List.of(task), PageRequest.of(0, 50), 1);
        when(taskRepository.findAll(any(Specification.class), any(Pageable.class))).thenReturn(page);

        PageResponse<CliDtos.CliTaskSummary> result =
                platformStoreService.pageMyRequirementTasks(7L, 1, 50, null, null, null, null);

        assertThat(result.records()).hasSize(1);
        assertThat(result.total()).isEqualTo(1L);
        CliDtos.CliTaskSummary summary = result.records().get(0);
        assertThat(summary.id()).isEqualTo(101L);
        assertThat(summary.workItemCode()).isEqualTo("#ABC123");
        assertThat(summary.name()).isEqualTo("登录支持验证码");
        assertThat(summary.workItemType()).isEqualTo("需求");
        assertThat(summary.status()).isEqualTo("进行中");
        assertThat(summary.priority()).isEqualTo("高");
        assertThat(summary.assignee()).isEqualTo("张三");
        assertThat(summary.projectId()).isEqualTo(5L);
        assertThat(summary.projectName()).isEqualTo("AI Club 平台");
        assertThat(summary.iterationId()).isEqualTo(9L);
        assertThat(summary.iterationName()).isEqualTo("迭代一");
        assertThat(summary.planStartDate()).isNotNull();
        assertThat(summary.planEndDate()).isNotNull();
        assertThat(summary.requirementMarkdown()).contains("用户故事");
        // 需求类型不返回 taskType（与 toTaskSummary 保持一致，仅“任务”类型才返回）
        assertThat(summary.taskType()).isNull();

        // 关键：CLI 需求查询绕过项目参与人可见性，不应触碰 ProjectDataPermissionService
        verifyNoInteractions(projectDataPermissionService);
    }

    /** 没有分配给当前用户的需求时返回空列表。 */
    @Test
    void shouldReturnEmptyWhenNoRequirementAssigned() {
        Page<TaskEntity> empty = new PageImpl<>(List.of(), PageRequest.of(0, 50), 0);
        when(taskRepository.findAll(any(Specification.class), any(Pageable.class))).thenReturn(empty);

        PageResponse<CliDtos.CliTaskSummary> result =
                platformStoreService.pageMyRequirementTasks(7L, 1, 50, null, null, null, null);

        assertThat(result.records()).isEmpty();
        assertThat(result.total()).isZero();
        verifyNoInteractions(projectDataPermissionService);
    }
}
