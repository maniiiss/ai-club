package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.TaskCommentEntity;
import com.aiclub.platform.domain.model.TaskEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.security.AuthContextHolder;
import com.aiclub.platform.util.RichTextUtils;
import com.aiclub.platform.util.TaskStatusUtils;
import org.springframework.stereotype.Service;

import java.time.format.DateTimeFormatter;
import java.util.LinkedHashSet;
import java.util.Set;

/**
 * 统一封装工作项相关的消息推送规则，避免通知文案和 bizType 分散在多个业务服务中。
 */
@Service
public class TaskNotificationService {

    /**
     * 工作项被分配给负责人。
     */
    public static final String BIZ_TYPE_TASK_ASSIGNED = "TASK_ASSIGNED";

    /**
     * 工作项负责人被取消分配。
     */
    public static final String BIZ_TYPE_TASK_UNASSIGNED = "TASK_UNASSIGNED";

    /**
     * 工作项状态发生变化。
     */
    public static final String BIZ_TYPE_TASK_STATUS_CHANGED = "TASK_STATUS_CHANGED";

    /**
     * 工作项新增协作人。
     */
    public static final String BIZ_TYPE_TASK_COLLABORATOR_ADDED = "TASK_COLLABORATOR_ADDED";

    /**
     * 工作项逾期提醒。
     */
    public static final String BIZ_TYPE_TASK_OVERDUE = "TASK_OVERDUE";

    private static final DateTimeFormatter DATE_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    private final NotificationService notificationService;

    public TaskNotificationService(NotificationService notificationService) {
        this.notificationService = notificationService;
    }

    /**
     * 工作项创建后，通知负责人和新增协作人。
     */
    public void notifyTaskCreated(TaskEntity task, UserEntity assigneeUser, Set<UserEntity> collaborators) {
        Long actorUserId = currentActorUserId();
        String workItemName = buildWorkItemName(task);
        if (assigneeUser != null && shouldNotifyUser(assigneeUser.getId(), actorUserId)) {
            notificationService.sendToUser(
                    assigneeUser.getId(),
                    NotificationService.TYPE_TASK,
                    NotificationService.LEVEL_INFO,
                    workItemName + "已分配给你",
                    "项目《" + task.getProject().getName() + "》新建了一个你负责的工作项，请及时处理。",
                    buildTaskActionUrl(task),
                    BIZ_TYPE_TASK_ASSIGNED,
                    task.getId()
            );
        }
        notifyNewCollaborators(task, collaborators, actorUserId, assigneeUser == null ? null : assigneeUser.getId());
    }

    /**
     * 工作项更新后，按负责人变化、协作人变化和状态变化拆分通知。
     */
    public void notifyTaskUpdated(TaskEntity task, Long previousAssigneeUserId, String previousStatus, Set<Long> previousCollaboratorUserIds) {
        Long actorUserId = currentActorUserId();
        Long currentAssigneeUserId = task.getAssigneeUser() == null ? null : task.getAssigneeUser().getId();
        String workItemName = buildWorkItemName(task);

        if (previousAssigneeUserId != null
                && !previousAssigneeUserId.equals(currentAssigneeUserId)
                && shouldNotifyUser(previousAssigneeUserId, actorUserId)) {
            notificationService.sendToUser(
                    previousAssigneeUserId,
                    NotificationService.TYPE_TASK,
                    NotificationService.LEVEL_WARNING,
                    "你已不再负责" + workItemName,
                    "项目《" + task.getProject().getName() + "》调整了工作项负责人，你已被取消分配。",
                    buildTaskActionUrl(task),
                    BIZ_TYPE_TASK_UNASSIGNED,
                    task.getId()
            );
        }

        if (currentAssigneeUserId != null
                && !currentAssigneeUserId.equals(previousAssigneeUserId)
                && shouldNotifyUser(currentAssigneeUserId, actorUserId)) {
            notificationService.sendToUser(
                    currentAssigneeUserId,
                    NotificationService.TYPE_TASK,
                    NotificationService.LEVEL_INFO,
                    previousAssigneeUserId == null ? workItemName + "已分配给你" : workItemName + "已转交给你",
                    previousAssigneeUserId == null
                            ? "项目《" + task.getProject().getName() + "》将该工作项分配给你，请及时处理。"
                            : "项目《" + task.getProject().getName() + "》更新了工作项负责人，请及时查看最新安排。",
                    buildTaskActionUrl(task),
                    BIZ_TYPE_TASK_ASSIGNED,
                    task.getId()
            );
        }

        Set<UserEntity> collaborators = task.getCollaborators();
        notifyNewCollaborators(task, collaborators, actorUserId, currentAssigneeUserId, previousCollaboratorUserIds);

        if (!defaultString(previousStatus).equals(defaultString(task.getStatus()))) {
            LinkedHashSet<Long> recipients = collaborators.stream()
                    .map(UserEntity::getId)
                    .collect(LinkedHashSet::new, LinkedHashSet::add, LinkedHashSet::addAll);
            if (currentAssigneeUserId != null) {
                recipients.add(currentAssigneeUserId);
            }
            recipients.remove(actorUserId);
            notificationService.sendToUsers(
                    recipients,
                    NotificationService.TYPE_TASK,
                    TaskStatusUtils.isCompletedStatus(task.getWorkItemType(), task.getStatus())
                            ? NotificationService.LEVEL_SUCCESS
                            : NotificationService.LEVEL_INFO,
                    workItemName + "状态已更新",
                    "项目《" + task.getProject().getName() + "》将工作项状态更新为「" + task.getStatus() + "」。",
                    buildTaskActionUrl(task),
                    BIZ_TYPE_TASK_STATUS_CHANGED,
                    task.getId()
            );
        }
    }

    /**
     * 工作项新增评论后，通知负责人和协作人。
     */
    public void notifyTaskCommentCreated(TaskEntity task, UserEntity author, TaskCommentEntity comment) {
        LinkedHashSet<Long> recipients = task.getCollaborators().stream()
                .map(UserEntity::getId)
                .collect(LinkedHashSet::new, LinkedHashSet::add, LinkedHashSet::addAll);
        if (task.getAssigneeUser() != null) {
            recipients.add(task.getAssigneeUser().getId());
        }
        recipients.remove(author.getId());
        notificationService.sendToUsers(
                recipients,
                NotificationService.TYPE_TASK,
                NotificationService.LEVEL_INFO,
                displayName(author) + "评论了" + buildWorkItemName(task),
                abbreviate(RichTextUtils.extractPlainText(comment.getContent()), 200),
                buildTaskActionUrl(task),
                "TASK_COMMENT",
                task.getId()
        );
    }

    /**
     * 工作项进入逾期周期时，只提醒当前负责人一次。
     */
    public void notifyTaskOverdue(TaskEntity task) {
        if (task.getAssigneeUser() == null || task.getPlanEndDate() == null) {
            return;
        }
        notificationService.sendToUser(
                task.getAssigneeUser().getId(),
                NotificationService.TYPE_TASK,
                NotificationService.LEVEL_WARNING,
                buildWorkItemName(task) + "已逾期",
                "项目《" + task.getProject().getName() + "》的工作项计划结束日期为 "
                        + task.getPlanEndDate().format(DATE_FORMATTER)
                        + "，请尽快处理。",
                buildTaskActionUrl(task),
                BIZ_TYPE_TASK_OVERDUE,
                task.getId()
        );
    }

    /**
     * 通知新增协作人，避免负责人和当前操作者重复收到同一条协作提醒。
     */
    private void notifyNewCollaborators(TaskEntity task,
                                        Set<UserEntity> collaborators,
                                        Long actorUserId,
                                        Long currentAssigneeUserId) {
        notifyNewCollaborators(task, collaborators, actorUserId, currentAssigneeUserId, Set.of());
    }

    /**
     * 只对本次新增的协作人发送提醒，避免编辑工作项时对旧协作人重复推送。
     */
    private void notifyNewCollaborators(TaskEntity task,
                                        Set<UserEntity> collaborators,
                                        Long actorUserId,
                                        Long currentAssigneeUserId,
                                        Set<Long> previousCollaboratorUserIds) {
        LinkedHashSet<Long> collaboratorIds = collaborators.stream()
                .map(UserEntity::getId)
                .collect(LinkedHashSet::new, LinkedHashSet::add, LinkedHashSet::addAll);
        collaboratorIds.remove(actorUserId);
        if (currentAssigneeUserId != null) {
            collaboratorIds.remove(currentAssigneeUserId);
        }
        if (previousCollaboratorUserIds != null && !previousCollaboratorUserIds.isEmpty()) {
            collaboratorIds.removeAll(previousCollaboratorUserIds);
        }
        notificationService.sendToUsers(
                collaboratorIds,
                NotificationService.TYPE_TASK,
                NotificationService.LEVEL_INFO,
                "你被加入" + buildWorkItemName(task) + "协作",
                "项目《" + task.getProject().getName() + "》将你设为协作人，请关注工作项进度。",
                buildTaskActionUrl(task),
                BIZ_TYPE_TASK_COLLABORATOR_ADDED,
                task.getId()
        );
    }

    private String buildTaskActionUrl(TaskEntity task) {
        return "/projects/" + task.getProject().getId() + "/iterations?openTaskId=" + task.getId();
    }

    private String buildWorkItemName(TaskEntity task) {
        return "工作项《" + task.getName() + "》";
    }

    private Long currentActorUserId() {
        return AuthContextHolder.get().map(authContext -> authContext.userId()).orElse(null);
    }

    private boolean shouldNotifyUser(Long recipientUserId, Long actorUserId) {
        return recipientUserId != null && !recipientUserId.equals(actorUserId);
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

    private String defaultString(String value) {
        return value == null ? "" : value;
    }
}
