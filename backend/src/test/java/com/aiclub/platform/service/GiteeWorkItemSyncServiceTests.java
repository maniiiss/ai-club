package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.IterationEntity;
import com.aiclub.platform.domain.model.IterationGiteeBindingEntity;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.ProjectGiteeBindingEntity;
import com.aiclub.platform.domain.model.TaskEntity;
import com.aiclub.platform.domain.model.TaskGiteeBindingEntity;
import com.aiclub.platform.dto.GiteeWorkItemSyncResult;
import com.aiclub.platform.repository.GiteeWorkItemSyncLogRepository;
import com.aiclub.platform.repository.IterationGiteeBindingRepository;
import com.aiclub.platform.repository.IterationRepository;
import com.aiclub.platform.repository.ProjectGiteeBindingRepository;
import com.aiclub.platform.repository.TaskGiteeBindingRepository;
import com.aiclub.platform.repository.TaskRepository;
import com.aiclub.platform.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class GiteeWorkItemSyncServiceTests {

    private static final String GITEE_REQUIREMENT_TEMPLATE = """
            # 1  功能点

            远端功能点

            # 2  流程图

            远端流程图

            # 3  原型

            远端原型

            # 4  非功能需求

            远端非功能需求
            """.trim();

    private static final String CONVERTED_REQUIREMENT_TEMPLATE = """
            # 用户故事

            待补充用户故事

            # 需求描述

            ## 功能点

            远端功能点

            ## 流程图

            远端流程图

            ## 原型

            远端原型

            ## 非功能需求

            远端非功能需求

            # 验收标准

            待补充验收标准
            """.trim();

    @Mock
    private IterationRepository iterationRepository;

    @Mock
    private IterationGiteeBindingRepository iterationGiteeBindingRepository;

    @Mock
    private ProjectGiteeBindingRepository projectGiteeBindingRepository;

    @Mock
    private TaskRepository taskRepository;

    @Mock
    private TaskGiteeBindingRepository taskGiteeBindingRepository;

    @Mock
    private GiteeWorkItemSyncLogRepository giteeWorkItemSyncLogRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private ProjectDataPermissionService projectDataPermissionService;

    @Mock
    private GiteeApiService giteeApiService;

    @Mock
    private TokenCipherService tokenCipherService;

    @Mock
    private KnowledgeGraphService knowledgeGraphService;

    private GiteeWorkItemSyncService giteeWorkItemSyncService;

    @BeforeEach
    void setUp() {
        giteeWorkItemSyncService = new GiteeWorkItemSyncService(
                iterationRepository,
                iterationGiteeBindingRepository,
                projectGiteeBindingRepository,
                taskRepository,
                taskGiteeBindingRepository,
                giteeWorkItemSyncLogRepository,
                userRepository,
                projectDataPermissionService,
                giteeApiService,
                tokenCipherService,
                knowledgeGraphService
        );
    }

    @Test
    void shouldCreateUpdateAndRemoveTasksDuringSyncWhilePreservingLocalExtendedFields() {
        ProjectEntity project = new ProjectEntity();
        project.setId(9L);
        project.setName("项目A");
        project.setOwner("负责人");
        project.setStatus("进行中");
        project.setDescription("项目A描述");

        IterationEntity iteration = new IterationEntity();
        iteration.setId(12L);
        iteration.setName("迭代A");
        iteration.setProject(project);

        ProjectGiteeBindingEntity projectBinding = new ProjectGiteeBindingEntity();
        projectBinding.setProject(project);
        projectBinding.setEnterpriseId(99L);
        projectBinding.setApiBaseUrl("https://api.gitee.com/enterprises");
        projectBinding.setAccessTokenCiphertext("cipher-token");
        projectBinding.setGiteeProgramId(1001L);
        projectBinding.setGiteeProgramName("远端项目A");

        IterationGiteeBindingEntity iterationBinding = new IterationGiteeBindingEntity();
        iterationBinding.setIteration(iteration);
        iterationBinding.setProject(project);
        iterationBinding.setGiteeMilestoneId(5001L);
        iterationBinding.setGiteeMilestoneTitle("里程碑A");

        TaskEntity existingTask = new TaskEntity();
        existingTask.setId(31L);
        existingTask.setName("旧标题");
        existingTask.setWorkItemCode("#ABC123");
        existingTask.setWorkItemType("需求");
        existingTask.setStatus("草稿");
        existingTask.setPriority("中");
        existingTask.setAssignee("旧负责人");
        existingTask.setProject(project);
        existingTask.setIteration(iteration);
        existingTask.setDescription("旧描述");
        existingTask.setRequirementMarkdown("保留的需求文档");
        existingTask.setPrototypeUrl("https://prototype.example.com/a");
        existingTask.setModuleName("保留模块");
        existingTask.setDevPassed(true);
        existingTask.setTestPassed(true);
        existingTask.setWorkHours(new BigDecimal("8.0"));

        TaskGiteeBindingEntity existingBinding = new TaskGiteeBindingEntity();
        existingBinding.setTask(existingTask);
        existingBinding.setProject(project);
        existingBinding.setIteration(iteration);
        existingBinding.setEnterpriseId(99L);
        existingBinding.setGiteeProgramId(1001L);
        existingBinding.setGiteeMilestoneId(5001L);
        existingBinding.setGiteeIssueId(101L);

        TaskEntity removedTask = new TaskEntity();
        removedTask.setId(41L);
        removedTask.setName("移出任务");
        removedTask.setWorkItemCode("#XYZ123");
        removedTask.setWorkItemType("任务");
        removedTask.setStatus("处理中");
        removedTask.setPriority("低");
        removedTask.setAssignee("旧负责人");
        removedTask.setProject(project);
        removedTask.setIteration(iteration);

        TaskGiteeBindingEntity removedBinding = new TaskGiteeBindingEntity();
        removedBinding.setTask(removedTask);
        removedBinding.setProject(project);
        removedBinding.setIteration(iteration);
        removedBinding.setEnterpriseId(99L);
        removedBinding.setGiteeProgramId(1001L);
        removedBinding.setGiteeMilestoneId(5001L);
        removedBinding.setGiteeIssueId(303L);

        when(iterationRepository.findById(12L)).thenReturn(Optional.of(iteration));
        when(iterationGiteeBindingRepository.findByIteration_Id(12L)).thenReturn(Optional.of(iterationBinding));
        when(projectGiteeBindingRepository.findByProject_Id(9L)).thenReturn(Optional.of(projectBinding));
        when(tokenCipherService.decrypt("cipher-token")).thenReturn("plain-token");
        when(giteeApiService.listIssues("https://api.gitee.com/enterprises", "plain-token", 99L, 1001L, 5001L))
                .thenReturn(List.of(
                        new GiteeApiService.GiteeIssue(101L, "新标题", GITEE_REQUIREMENT_TEMPLATE, "需求", "处理中", "0", "Alice", "2026-04-01", "2026-04-10", "https://gitee.com/issues/101"),
                        new GiteeApiService.GiteeIssue(202L, "新增任务", "新增描述", "任务", "待开始", "1", "Bob", "2026-04-02", "2026-04-12", "https://gitee.com/issues/202")
                ));
        when(taskGiteeBindingRepository.findAllByEnterpriseIdAndGiteeIssueIdIn(99L, List.of(101L, 202L)))
                .thenReturn(List.of(existingBinding));
        when(taskGiteeBindingRepository.findAllByIteration_IdOrderByIdAsc(12L))
                .thenReturn(List.of(existingBinding, removedBinding));
        when(taskRepository.existsByWorkItemCode(any())).thenReturn(false);
        when(taskRepository.save(any(TaskEntity.class))).thenAnswer(invocation -> {
            TaskEntity entity = invocation.getArgument(0);
            if (entity.getId() == null) {
                entity.setId(55L);
            }
            return entity;
        });
        when(taskGiteeBindingRepository.save(any(TaskGiteeBindingEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(giteeWorkItemSyncLogRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        GiteeWorkItemSyncResult result = giteeWorkItemSyncService.syncIterationWorkItems(12L);

        assertThat(result.executionStatus()).isEqualTo("SUCCESS");
        assertThat(result.totalIssueCount()).isEqualTo(2);
        assertThat(result.createdCount()).isEqualTo(1);
        assertThat(result.updatedCount()).isEqualTo(1);
        assertThat(result.removedCount()).isEqualTo(1);
        assertThat(result.failedCount()).isEqualTo(0);

        assertThat(existingTask.getName()).isEqualTo("新标题");
        assertThat(existingTask.getDescription()).isEqualTo("保留的需求文档");
        assertThat(existingTask.getStatus()).isEqualTo("处理中");
        assertThat(existingTask.getPriority()).isEqualTo("高");
        assertThat(existingTask.getAssignee()).isEqualTo("Alice");
        assertThat(existingTask.getRequirementMarkdown()).isEqualTo("保留的需求文档");
        assertThat(existingTask.getPrototypeUrl()).isEqualTo("https://prototype.example.com/a");
        assertThat(existingTask.getModuleName()).isEqualTo("保留模块");
        assertThat(existingTask.isDevPassed()).isTrue();
        assertThat(existingTask.isTestPassed()).isTrue();
        assertThat(existingTask.getWorkHours()).isEqualByComparingTo("8.0");
        ArgumentCaptor<TaskEntity> taskCaptor = ArgumentCaptor.forClass(TaskEntity.class);
        verify(taskRepository, org.mockito.Mockito.atLeastOnce()).save(taskCaptor.capture());
        assertThat(taskCaptor.getAllValues()).anySatisfy(task -> {
            if ("新增任务".equals(task.getName())) {
                assertThat(task.getPriority()).isEqualTo("中");
            }
        });

        assertThat(removedTask.getIteration()).isNull();
        verify(knowledgeGraphService).rebuildProjectGraph(9L);

        ArgumentCaptor<com.aiclub.platform.domain.model.GiteeWorkItemSyncLogEntity> logCaptor = ArgumentCaptor.forClass(com.aiclub.platform.domain.model.GiteeWorkItemSyncLogEntity.class);
        verify(giteeWorkItemSyncLogRepository).save(logCaptor.capture());
        assertThat(logCaptor.getValue().getCreatedCount()).isEqualTo(1);
        assertThat(logCaptor.getValue().getUpdatedCount()).isEqualTo(1);
        assertThat(logCaptor.getValue().getRemovedCount()).isEqualTo(1);
        assertThat(logCaptor.getValue().getFailedCount()).isEqualTo(0);
    }

    @Test
    void shouldBackfillConvertedRequirementTemplateWhenExistingRequirementDocumentIsMirror() {
        ProjectEntity project = new ProjectEntity();
        project.setId(9L);
        project.setName("项目A");
        project.setOwner("负责人");
        project.setStatus("进行中");
        project.setDescription("项目A描述");

        IterationEntity iteration = new IterationEntity();
        iteration.setId(12L);
        iteration.setName("迭代A");
        iteration.setProject(project);

        ProjectGiteeBindingEntity projectBinding = new ProjectGiteeBindingEntity();
        projectBinding.setProject(project);
        projectBinding.setEnterpriseId(99L);
        projectBinding.setApiBaseUrl("https://api.gitee.com/enterprises");
        projectBinding.setAccessTokenCiphertext("cipher-token");
        projectBinding.setGiteeProgramId(1001L);
        projectBinding.setGiteeProgramName("远端项目A");

        IterationGiteeBindingEntity iterationBinding = new IterationGiteeBindingEntity();
        iterationBinding.setIteration(iteration);
        iterationBinding.setProject(project);
        iterationBinding.setGiteeMilestoneId(5001L);
        iterationBinding.setGiteeMilestoneTitle("迭代A");

        TaskEntity existingTask = new TaskEntity();
        existingTask.setId(31L);
        existingTask.setName("旧标题");
        existingTask.setWorkItemCode("#ABC123");
        existingTask.setWorkItemType("需求");
        existingTask.setStatus("草稿");
        existingTask.setPriority("中");
        existingTask.setAssignee("旧负责人");
        existingTask.setProject(project);
        existingTask.setIteration(iteration);
        existingTask.setDescription("旧描述");
        existingTask.setRequirementMarkdown("");
        existingTask.setPrototypeUrl("https://prototype.example.com/a");
        existingTask.setModuleName("保留模块");

        TaskGiteeBindingEntity existingBinding = new TaskGiteeBindingEntity();
        existingBinding.setTask(existingTask);
        existingBinding.setProject(project);
        existingBinding.setIteration(iteration);
        existingBinding.setEnterpriseId(99L);
        existingBinding.setGiteeProgramId(1001L);
        existingBinding.setGiteeMilestoneId(5001L);
        existingBinding.setGiteeIssueId(101L);

        when(iterationRepository.findById(12L)).thenReturn(Optional.of(iteration));
        when(iterationGiteeBindingRepository.findByIteration_Id(12L)).thenReturn(Optional.of(iterationBinding));
        when(projectGiteeBindingRepository.findByProject_Id(9L)).thenReturn(Optional.of(projectBinding));
        when(tokenCipherService.decrypt("cipher-token")).thenReturn("plain-token");
        when(giteeApiService.listIssues("https://api.gitee.com/enterprises", "plain-token", 99L, 1001L, 5001L))
                .thenReturn(List.of(
                        new GiteeApiService.GiteeIssue(101L, "新标题", GITEE_REQUIREMENT_TEMPLATE, "需求", "处理中", "高", "Alice", "2026-04-01", "2026-04-10", "https://gitee.com/issues/101")
                ));
        when(taskGiteeBindingRepository.findAllByEnterpriseIdAndGiteeIssueIdIn(99L, List.of(101L)))
                .thenReturn(List.of(existingBinding));
        when(taskGiteeBindingRepository.findAllByIteration_IdOrderByIdAsc(12L))
                .thenReturn(List.of(existingBinding));
        when(taskGiteeBindingRepository.save(any(TaskGiteeBindingEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(giteeWorkItemSyncLogRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        GiteeWorkItemSyncResult result = giteeWorkItemSyncService.syncIterationWorkItems(12L);

        assertThat(result.executionStatus()).isEqualTo("SUCCESS");
        assertThat(existingTask.getDescription()).isEqualTo(CONVERTED_REQUIREMENT_TEMPLATE);
        assertThat(existingTask.getRequirementMarkdown()).isEqualTo(CONVERTED_REQUIREMENT_TEMPLATE);
        assertThat(existingTask.getPrototypeUrl()).isEqualTo("https://prototype.example.com/a");
        assertThat(existingTask.getModuleName()).isEqualTo("保留模块");
    }

    @Test
    void shouldFetchIssueDetailWhenListResponseDoesNotContainDescription() {
        ProjectEntity project = new ProjectEntity();
        project.setId(9L);
        project.setName("项目A");
        project.setOwner("负责人");
        project.setStatus("进行中");
        project.setDescription("项目A描述");

        IterationEntity iteration = new IterationEntity();
        iteration.setId(12L);
        iteration.setName("迭代A");
        iteration.setProject(project);

        ProjectGiteeBindingEntity projectBinding = new ProjectGiteeBindingEntity();
        projectBinding.setProject(project);
        projectBinding.setEnterpriseId(99L);
        projectBinding.setApiBaseUrl("https://api.gitee.com/enterprises");
        projectBinding.setAccessTokenCiphertext("cipher-token");
        projectBinding.setGiteeProgramId(1001L);
        projectBinding.setGiteeProgramName("远端项目A");

        IterationGiteeBindingEntity iterationBinding = new IterationGiteeBindingEntity();
        iterationBinding.setIteration(iteration);
        iterationBinding.setProject(project);
        iterationBinding.setGiteeMilestoneId(5001L);
        iterationBinding.setGiteeMilestoneTitle("迭代A");

        TaskEntity existingTask = new TaskEntity();
        existingTask.setId(31L);
        existingTask.setName("旧标题");
        existingTask.setWorkItemCode("#ABC123");
        existingTask.setWorkItemType("任务");
        existingTask.setStatus("草稿");
        existingTask.setPriority("中");
        existingTask.setAssignee("旧负责人");
        existingTask.setProject(project);
        existingTask.setIteration(iteration);
        existingTask.setDescription("");
        existingTask.setRequirementMarkdown("");

        TaskGiteeBindingEntity existingBinding = new TaskGiteeBindingEntity();
        existingBinding.setTask(existingTask);
        existingBinding.setProject(project);
        existingBinding.setIteration(iteration);
        existingBinding.setEnterpriseId(99L);
        existingBinding.setGiteeProgramId(1001L);
        existingBinding.setGiteeMilestoneId(5001L);
        existingBinding.setGiteeIssueId(101L);

        when(iterationRepository.findById(12L)).thenReturn(Optional.of(iteration));
        when(iterationGiteeBindingRepository.findByIteration_Id(12L)).thenReturn(Optional.of(iterationBinding));
        when(projectGiteeBindingRepository.findByProject_Id(9L)).thenReturn(Optional.of(projectBinding));
        when(tokenCipherService.decrypt("cipher-token")).thenReturn("plain-token");
        when(giteeApiService.listIssues("https://api.gitee.com/enterprises", "plain-token", 99L, 1001L, 5001L))
                .thenReturn(List.of(
                        new GiteeApiService.GiteeIssue(101L, "新标题", "", "任务", "处理中", "3", "Alice", "2026-04-01", "2026-04-10", "https://gitee.com/issues/101")
                ));
        when(giteeApiService.fetchIssueDetail("https://api.gitee.com/enterprises", "plain-token", 99L, 101L))
                .thenReturn(new GiteeApiService.GiteeIssue(101L, "新标题", "详情正文", "任务", "处理中", "3", "Alice", "2026-04-01", "2026-04-10", "https://gitee.com/issues/101"));
        when(taskGiteeBindingRepository.findAllByEnterpriseIdAndGiteeIssueIdIn(99L, List.of(101L)))
                .thenReturn(List.of(existingBinding));
        when(taskGiteeBindingRepository.findAllByIteration_IdOrderByIdAsc(12L))
                .thenReturn(List.of(existingBinding));
        when(taskGiteeBindingRepository.save(any(TaskGiteeBindingEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(giteeWorkItemSyncLogRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        GiteeWorkItemSyncResult result = giteeWorkItemSyncService.syncIterationWorkItems(12L);

        assertThat(result.executionStatus()).isEqualTo("SUCCESS");
        assertThat(existingTask.getDescription()).isEqualTo("详情正文");
        assertThat(existingTask.getPriority()).isEqualTo("低");
        verify(giteeApiService).fetchIssueDetail("https://api.gitee.com/enterprises", "plain-token", 99L, 101L);
    }
}
