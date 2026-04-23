package com.aiclub.platform.service;

import com.aiclub.platform.common.DataPermissionScopeType;
import com.aiclub.platform.domain.model.NotificationMessageEntity;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.RoleEntity;
import com.aiclub.platform.domain.model.TaskEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.ProjectSummary;
import com.aiclub.platform.dto.TaskSummary;
import com.aiclub.platform.dto.request.ProjectRequest;
import com.aiclub.platform.dto.request.TaskRequest;
import com.aiclub.platform.repository.NotificationMessageRepository;
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

import java.time.LocalDate;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 覆盖工作项消息推送的核心集成场景，确保负责人变更、逾期提醒和深链跳转不会回归。
 */
@SpringBootTest
@Transactional
class TaskNotificationIntegrationTests {

    @Autowired
    private PlatformStoreService platformStoreService;

    @Autowired
    private TaskRepository taskRepository;

    @Autowired
    private NotificationService notificationService;

    @Autowired
    private NotificationMessageRepository notificationMessageRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private RoleRepository roleRepository;

    @Autowired
    private ProjectRepository projectRepository;

    @Autowired
    private TaskOverdueNotificationScheduler taskOverdueNotificationScheduler;

    @AfterEach
    void clearAuthContext() {
        AuthContextHolder.clear();
    }

    /**
     * 负责人发生转交和取消分配时，应分别给新旧负责人发送不同 bizType 的消息。
     */
    @Test
    void shouldSendAssignmentAndUnassignmentNotificationsWhenAssigneeChanges() {
        UserEntity creator = createUser("task-notify-creator-a", "创建人甲");
        UserEntity owner = createUser("task-notify-owner-a", "项目负责人甲");
        UserEntity assigneeA = createUser("task-notify-assignee-a", "执行人甲");
        UserEntity assigneeB = createUser("task-notify-assignee-b", "执行人乙");
        ProjectEntity project = createProjectAs(creator, owner, "消息项目A", List.of(assigneeA, assigneeB));

        loginAs(creator);
        TaskSummary created = platformStoreService.createTask(buildTaskRequest(
                "工作项负责人流转",
                project.getId(),
                assigneeA.getId(),
                LocalDate.now().toString(),
                LocalDate.now().plusDays(3).toString(),
                "草稿"
        ));

        assertThat(findNotificationsByBizType(TaskNotificationService.BIZ_TYPE_TASK_ASSIGNED))
                .hasSize(1)
                .allSatisfy(item -> {
                    assertThat(item.getRecipientUser().getId()).isEqualTo(assigneeA.getId());
                    assertThat(item.getActionUrl()).isEqualTo(buildTaskActionUrl(project.getId(), created.id()));
                });

        TaskSummary current = platformStoreService.getTask(created.id());
        platformStoreService.updateTask(created.id(), copyTaskRequest(current, assigneeB.getId(), current.planEndDate(), current.status()));

        List<NotificationMessageEntity> unassignedNotifications = findNotificationsByBizType(TaskNotificationService.BIZ_TYPE_TASK_UNASSIGNED);
        List<NotificationMessageEntity> assignedNotifications = findNotificationsByBizType(TaskNotificationService.BIZ_TYPE_TASK_ASSIGNED);

        assertThat(unassignedNotifications)
                .hasSize(1)
                .allSatisfy(item -> assertThat(item.getRecipientUser().getId()).isEqualTo(assigneeA.getId()));
        assertThat(assignedNotifications)
                .hasSize(2)
                .extracting(item -> item.getRecipientUser().getId())
                .containsExactlyInAnyOrder(assigneeA.getId(), assigneeB.getId());

        TaskSummary reassigned = platformStoreService.getTask(created.id());
        platformStoreService.updateTask(created.id(), copyTaskRequest(reassigned, null, reassigned.planEndDate(), reassigned.status()));

        assertThat(findNotificationsByBizType(TaskNotificationService.BIZ_TYPE_TASK_UNASSIGNED))
                .hasSize(2)
                .extracting(item -> item.getRecipientUser().getId())
                .containsExactlyInAnyOrder(assigneeA.getId(), assigneeB.getId());
    }

    /**
     * 同一逾期周期只能提醒一次；当工作项恢复正常后再次逾期，应允许重新发送首次提醒。
     */
    @Test
    void shouldNotifyOverdueOnlyOncePerCycleAndResetAfterRecovery() {
        UserEntity creator = createUser("task-notify-creator-b", "创建人乙");
        UserEntity owner = createUser("task-notify-owner-b", "项目负责人乙");
        UserEntity assignee = createUser("task-notify-overdue-b", "执行人丙");
        ProjectEntity project = createProjectAs(creator, owner, "消息项目B", List.of(assignee));

        loginAs(creator);
        TaskSummary created = platformStoreService.createTask(buildTaskRequest(
                "工作项逾期提醒",
                project.getId(),
                assignee.getId(),
                LocalDate.now().minusDays(5).toString(),
                LocalDate.now().minusDays(1).toString(),
                "处理中"
        ));

        AuthContextHolder.clear();
        taskOverdueNotificationScheduler.execute();

        TaskEntity firstOverdueTask = taskRepository.findById(created.id()).orElseThrow();
        assertThat(firstOverdueTask.getOverdueNotifiedAt()).isNotNull();
        assertThat(findNotificationsByBizType(TaskNotificationService.BIZ_TYPE_TASK_OVERDUE))
                .hasSize(1)
                .allSatisfy(item -> {
                    assertThat(item.getRecipientUser().getId()).isEqualTo(assignee.getId());
                    assertThat(item.getActionUrl()).isEqualTo(buildTaskActionUrl(project.getId(), created.id()));
                });

        taskOverdueNotificationScheduler.execute();
        assertThat(findNotificationsByBizType(TaskNotificationService.BIZ_TYPE_TASK_OVERDUE)).hasSize(1);

        loginAs(creator);
        TaskSummary current = platformStoreService.getTask(created.id());
        platformStoreService.updateTask(created.id(), copyTaskRequest(current, assignee.getId(), LocalDate.now().plusDays(2).toString(), "处理中"));

        TaskEntity recoveredTask = taskRepository.findById(created.id()).orElseThrow();
        assertThat(recoveredTask.getOverdueNotifiedAt()).isNull();

        TaskSummary recovered = platformStoreService.getTask(created.id());
        platformStoreService.updateTask(created.id(), copyTaskRequest(recovered, assignee.getId(), LocalDate.now().minusDays(2).toString(), "处理中"));

        AuthContextHolder.clear();
        taskOverdueNotificationScheduler.execute();

        TaskEntity secondOverdueTask = taskRepository.findById(created.id()).orElseThrow();
        assertThat(secondOverdueTask.getOverdueNotifiedAt()).isNotNull();
        assertThat(findNotificationsByBizType(TaskNotificationService.BIZ_TYPE_TASK_OVERDUE)).hasSize(2);
    }

    /**
     * 执行中心的规划确认通知使用较长的 bizType 语义码，
     * 这里直接落库验证长度扩容已经生效，避免 mock 测试通过但数据库写入失败。
     */
    @Test
    void shouldPersistLongExecutionNotificationBizType() {
        UserEntity recipient = createUser("task-notify-long-biz-type", "长编码接收人");

        notificationService.sendToUser(
                recipient.getId(),
                NotificationService.TYPE_TASK,
                NotificationService.LEVEL_INFO,
                "开发执行待确认：示例任务",
                "执行规划已生成，请前往执行详情查看、编辑并确认继续。",
                "/tasks/999",
                "DEVELOPMENT_EXECUTION_PLAN_CONFIRMATION_REQUIRED",
                999L
        );

        assertThat(findNotificationsByBizType("DEVELOPMENT_EXECUTION_PLAN_CONFIRMATION_REQUIRED"))
                .hasSize(1)
                .allSatisfy(item -> {
                    assertThat(item.getRecipientUser().getId()).isEqualTo(recipient.getId());
                    assertThat(item.getBizType()).isEqualTo("DEVELOPMENT_EXECUTION_PLAN_CONFIRMATION_REQUIRED");
                    assertThat(item.getActionUrl()).isEqualTo("/tasks/999");
                });
    }

    /**
     * 创建带默认权限角色的测试用户。
     */
    private UserEntity createUser(String username, String nickname) {
        RoleEntity defaultRole = createRole("ROLE_" + username.toUpperCase());
        UserEntity user = new UserEntity();
        user.setUsername(username);
        user.setNickname(nickname);
        user.setPasswordHash("test-password-hash");
        user.setEnabled(true);
        user.setRoles(new LinkedHashSet<>(List.of(defaultRole)));
        return userRepository.save(user);
    }

    /**
     * 创建满足项目可见性与管理权限的默认测试角色。
     */
    private RoleEntity createRole(String code) {
        RoleEntity role = new RoleEntity();
        role.setName(code);
        role.setCode(code);
        role.setEnabled(true);
        role.setDescription(code + " 描述");
        role.setProjectVisibilityScope(DataPermissionScopeType.PROJECT_PARTICIPANT);
        role.setProjectManageScope(DataPermissionScopeType.OWNER_OR_CREATOR);
        role.setIterationDeleteScope(DataPermissionScopeType.CREATOR_ONLY);
        role.setTaskDeleteScope(DataPermissionScopeType.CREATOR_ONLY);
        return roleRepository.save(role);
    }

    /**
     * 将当前线程切换为指定测试用户登录态。
     */
    private void loginAs(UserEntity user) {
        AuthContextHolder.set(new AuthContext(
                user.getId(),
                user.getUsername(),
                user.getNickname(),
                user.getRoles().stream().map(RoleEntity::getCode).collect(Collectors.toSet()),
                Set.of()
        ));
    }

    /**
     * 以指定创建人身份创建测试项目。
     */
    private ProjectEntity createProjectAs(UserEntity creator, UserEntity owner, String name, List<UserEntity> members) {
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

    /**
     * 统一构造测试用的工作项请求。
     */
    private TaskRequest buildTaskRequest(String name,
                                         Long projectId,
                                         Long assigneeUserId,
                                         String planStartDate,
                                         String planEndDate,
                                         String status) {
        return new TaskRequest(
                name,
                "任务",
                status,
                "中",
                "",
                assigneeUserId,
                List.of(),
                name + " 的描述",
                "",
                "",
                "",
                false,
                false,
                null,
                planStartDate,
                planEndDate,
                projectId,
                null,
                null,
                null
        );
    }

    /**
     * 基于当前工作项快照生成更新请求，只覆盖本次测试关心的字段。
     */
    private TaskRequest copyTaskRequest(TaskSummary task, Long assigneeUserId, String planEndDate, String status) {
        return new TaskRequest(
                task.name(),
                task.workItemType(),
                status,
                task.priority(),
                "",
                assigneeUserId,
                task.collaboratorUserIds(),
                task.description(),
                task.requirementMarkdown(),
                task.prototypeUrl(),
                task.moduleName(),
                task.devPassed(),
                task.testPassed(),
                task.workHours(),
                task.planStartDate(),
                planEndDate,
                task.projectId(),
                task.agentId(),
                task.iterationId(),
                task.requirementTaskId()
        );
    }

    private List<NotificationMessageEntity> findNotificationsByBizType(String bizType) {
        return notificationMessageRepository.findAll().stream()
                .filter(item -> bizType.equals(item.getBizType()))
                .toList();
    }

    private String buildTaskActionUrl(Long projectId, Long taskId) {
        return "/projects/" + projectId + "/iterations?openTaskId=" + taskId;
    }
}
