package com.aiclub.platform.service;

import com.aiclub.platform.dto.CurrentUserInfo;
import com.aiclub.platform.dto.DashboardOverview;
import com.aiclub.platform.dto.HermesReferenceSummary;
import com.aiclub.platform.dto.IterationSummary;
import com.aiclub.platform.dto.NotificationItem;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.ProjectSummary;
import com.aiclub.platform.dto.TaskAgentRunSummary;
import com.aiclub.platform.dto.TaskCommentSummary;
import com.aiclub.platform.dto.TaskSummary;
import com.aiclub.platform.dto.request.HermesChatRequest;
import com.aiclub.platform.exception.ForbiddenException;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.NoSuchElementException;

/**
 * 按当前页面上下文组装 Hermes 所需的业务摘要，避免直接把数据库结构暴露给大模型。
 */
@Service
public class HermesContextAssembler {

    private final PlatformStoreService platformStoreService;
    private final NotificationService notificationService;
    private final TaskAgentRunService taskAgentRunService;
    private final HermesProperties hermesProperties;

    public HermesContextAssembler(PlatformStoreService platformStoreService,
                                  NotificationService notificationService,
                                  TaskAgentRunService taskAgentRunService,
                                  HermesProperties hermesProperties) {
        this.platformStoreService = platformStoreService;
        this.notificationService = notificationService;
        this.taskAgentRunService = taskAgentRunService;
        this.hermesProperties = hermesProperties;
    }

    /**
     * 根据路由、项目和任务信息选择最合适的上下文装配策略。
     */
    public HermesConversationContext assemble(HermesChatRequest request, CurrentUserInfo currentUser) {
        String routeName = normalizeRouteName(request.routeName());
        try {
            if (request.taskId() != null) {
                return buildTaskContext(routeName, request.taskId(), currentUser);
            }
            if (request.projectId() != null) {
                return buildProjectContext(routeName, request.projectId(), currentUser);
            }
            if ("dashboard".equals(routeName)) {
                return buildDashboardContext(currentUser);
            }
        } catch (ForbiddenException | NoSuchElementException ignored) {
            // 当用户无法访问指定项目或任务时，自动回退为全局助手，避免暴露无权限数据。
        }
        return buildGlobalContext(routeName, currentUser);
    }

    /**
     * 首页场景聚合我的任务、未读通知和近期异常，方便 Hermes 给出工作优先级建议。
     */
    private HermesConversationContext buildDashboardContext(CurrentUserInfo currentUser) {
        int limit = hermesProperties.getMaxContextMessages();
        DashboardOverview overview = platformStoreService.getDashboardOverview();
        PageResponse<NotificationItem> notificationPage = notificationService.pageCurrentUserNotifications(1, limit, true, null);
        List<TaskSummary> focusTasks = trimTaskList(overview.myTasks() == null || overview.myTasks().isEmpty() ? overview.recentTasks() : overview.myTasks());
        List<HermesReferenceSummary> references = new ArrayList<>();
        references.add(new HermesReferenceSummary("DASHBOARD", null, "首页看板", "/dashboard"));
        for (TaskSummary task : focusTasks.stream().limit(2).toList()) {
            references.add(taskReference(task));
        }
        StringBuilder context = new StringBuilder();
        context.append("## 当前场景\n")
                .append("首页看板\n\n")
                .append("## 当前用户\n")
                .append("昵称：").append(defaultDisplayName(currentUser)).append('\n')
                .append("角色：").append(resolveRoleName(currentUser)).append("\n\n")
                .append("## 我的关注任务\n");
        appendTaskList(context, focusTasks);
        context.append("\n## 未读通知\n");
        appendNotifications(context, notificationPage.records());
        context.append("\n## 项目概览\n")
                .append("项目总数：").append(overview.stats() == null ? 0 : overview.stats().projectCount()).append('\n')
                .append("任务总数：").append(overview.stats() == null ? 0 : overview.stats().taskCount()).append('\n');
        return new HermesConversationContext(
                "dashboard",
                null,
                null,
                resolveRoleName(currentUser),
                references,
                List.of("我今天最该推进什么", "哪些项目本周有延期风险", "最近有哪些需要我关注的异常"),
                context.toString()
        );
    }

    /**
     * 项目场景聚合项目摘要、近期迭代和近期工作项，方便 Hermes 从项目管理视角作答。
     */
    private HermesConversationContext buildProjectContext(String routeName, Long projectId, CurrentUserInfo currentUser) {
        ProjectSummary project = platformStoreService.getProject(projectId);
        PageResponse<TaskSummary> taskPage = platformStoreService.pageTasks(1, hermesProperties.getMaxContextMessages(), null, null, null, projectId, null);
        List<IterationSummary> iterations = platformStoreService.listProjectIterations(projectId).stream()
                .limit(hermesProperties.getMaxContextMessages())
                .toList();
        List<HermesReferenceSummary> references = new ArrayList<>();
        references.add(projectReference(project));
        for (TaskSummary task : taskPage.records().stream().limit(2).toList()) {
            references.add(taskReference(task));
        }
        StringBuilder context = new StringBuilder();
        context.append("## 当前场景\n")
                .append("项目工作区\n\n")
                .append("## 当前用户\n")
                .append("昵称：").append(defaultDisplayName(currentUser)).append('\n')
                .append("角色：").append(resolveRoleName(currentUser)).append("\n\n")
                .append("## 项目摘要\n")
                .append("项目名称：").append(defaultString(project.name())).append('\n')
                .append("项目状态：").append(defaultString(project.status())).append('\n')
                .append("负责人：").append(defaultString(project.owner())).append('\n')
                .append("项目说明：").append(defaultString(project.description())).append('\n')
                .append("成员数量：").append(project.memberNames() == null ? 0 : project.memberNames().size()).append('\n')
                .append("任务数量：").append(project.taskCount() == null ? 0 : project.taskCount()).append("\n\n")
                .append("## 近期迭代\n");
        appendIterations(context, iterations);
        context.append("\n## 近期工作项\n");
        appendTaskList(context, taskPage.records());
        return new HermesConversationContext(
                isProjectScene(routeName) ? routeName : "project",
                project.id(),
                null,
                resolveRoleName(currentUser),
                references,
                List.of("这个项目当前最大的阻塞是什么", "最近这个项目有哪些关键变化", "这个项目本周最值得关注的风险是什么"),
                context.toString()
        );
    }

    /**
     * 任务场景聚合任务详情、最近评论和最近 Agent 执行结果，帮助 Hermes 从执行上下文作答。
     */
    private HermesConversationContext buildTaskContext(String routeName, Long taskId, CurrentUserInfo currentUser) {
        TaskSummary task = platformStoreService.getTask(taskId);
        ProjectSummary project = platformStoreService.getProject(task.projectId());
        List<TaskCommentSummary> comments = trimCommentList(platformStoreService.listTaskComments(taskId));
        List<TaskAgentRunSummary> recentRuns = taskAgentRunService.listRecentRuns(taskId).stream()
                .limit(hermesProperties.getMaxContextMessages())
                .toList();
        List<HermesReferenceSummary> references = List.of(
                taskReference(task),
                projectReference(project)
        );
        StringBuilder context = new StringBuilder();
        context.append("## 当前场景\n")
                .append("任务执行上下文\n\n")
                .append("## 当前用户\n")
                .append("昵称：").append(defaultDisplayName(currentUser)).append('\n')
                .append("角色：").append(resolveRoleName(currentUser)).append("\n\n")
                .append("## 所属项目\n")
                .append("项目名称：").append(defaultString(project.name())).append('\n')
                .append("项目状态：").append(defaultString(project.status())).append("\n\n")
                .append("## 任务详情\n")
                .append("标题：").append(defaultString(task.name())).append('\n')
                .append("工作项编号：").append(defaultString(task.workItemCode())).append('\n')
                .append("类型：").append(defaultString(task.workItemType())).append('\n')
                .append("状态：").append(defaultString(task.status())).append('\n')
                .append("优先级：").append(defaultString(task.priority())).append('\n')
                .append("负责人：").append(defaultString(task.assignee())).append('\n')
                .append("说明：").append(defaultString(task.description())).append("\n\n")
                .append("## 最近评论\n");
        appendComments(context, comments);
        context.append("\n## 最近智能体执行\n");
        appendAgentRuns(context, recentRuns);
        return new HermesConversationContext(
                "tasks".equals(routeName) ? "tasks" : "task",
                task.projectId(),
                task.id(),
                resolveRoleName(currentUser),
                references,
                List.of("这个任务为什么延期了", "这个任务上次讨论到哪了", "我接手这个任务应该先看什么"),
                context.toString()
        );
    }

    /**
     * 不支持专属上下文的页面统一退化为全局助手，仍保留角色感知和当前页面信息。
     */
    private HermesConversationContext buildGlobalContext(String routeName, CurrentUserInfo currentUser) {
        StringBuilder context = new StringBuilder();
        context.append("## 当前场景\n")
                .append("全局助手\n\n")
                .append("## 当前用户\n")
                .append("昵称：").append(defaultDisplayName(currentUser)).append('\n')
                .append("角色：").append(resolveRoleName(currentUser)).append('\n')
                .append("当前路由：").append(defaultString(routeName)).append('\n');
        return new HermesConversationContext(
                "global",
                null,
                null,
                resolveRoleName(currentUser),
                List.of(new HermesReferenceSummary("GLOBAL", null, "全局工作台", "/dashboard")),
                List.of("我今天最该推进什么", "帮我总结当前最值得关注的事项", "最近有哪些需要我关注的异常"),
                context.toString()
        );
    }

    private void appendTaskList(StringBuilder builder, List<TaskSummary> tasks) {
        if (tasks == null || tasks.isEmpty()) {
            builder.append("- 暂无相关任务\n");
            return;
        }
        for (TaskSummary task : tasks.stream().limit(hermesProperties.getMaxContextMessages()).toList()) {
            builder.append("- ")
                    .append(defaultString(task.name()))
                    .append(" / 状态：").append(defaultString(task.status()))
                    .append(" / 优先级：").append(defaultString(task.priority()))
                    .append(" / 负责人：").append(defaultString(task.assignee()))
                    .append('\n');
        }
    }

    private void appendNotifications(StringBuilder builder, List<NotificationItem> notifications) {
        if (notifications == null || notifications.isEmpty()) {
            builder.append("- 暂无未读通知\n");
            return;
        }
        for (NotificationItem item : notifications.stream().limit(hermesProperties.getMaxContextMessages()).toList()) {
            builder.append("- ")
                    .append(defaultString(item.title()))
                    .append(" / 类型：").append(defaultString(item.type()))
                    .append(" / 级别：").append(defaultString(item.level()))
                    .append('\n');
        }
    }

    private void appendIterations(StringBuilder builder, List<IterationSummary> iterations) {
        if (iterations == null || iterations.isEmpty()) {
            builder.append("- 当前项目暂无迭代\n");
            return;
        }
        for (IterationSummary iteration : iterations) {
            builder.append("- ")
                    .append(defaultString(iteration.name()))
                    .append(" / 状态：").append(defaultString(iteration.status()))
                    .append(" / 目标：").append(defaultString(iteration.goal()))
                    .append('\n');
        }
    }

    private void appendComments(StringBuilder builder, List<TaskCommentSummary> comments) {
        if (comments == null || comments.isEmpty()) {
            builder.append("- 当前任务暂无评论\n");
            return;
        }
        for (TaskCommentSummary comment : comments) {
            builder.append("- ")
                    .append(defaultString(comment.authorName()))
                    .append("：")
                    .append(defaultString(comment.content()))
                    .append('\n');
        }
    }

    private void appendAgentRuns(StringBuilder builder, List<TaskAgentRunSummary> runs) {
        if (runs == null || runs.isEmpty()) {
            builder.append("- 当前任务暂无最近的智能体运行记录\n");
            return;
        }
        for (TaskAgentRunSummary run : runs) {
            builder.append("- ")
                    .append(defaultString(run.agentName()))
                    .append(" / 状态：").append(defaultString(run.status()))
                    .append(" / 时间：").append(defaultString(run.createdAt()))
                    .append('\n');
        }
    }

    private List<TaskSummary> trimTaskList(List<TaskSummary> tasks) {
        if (tasks == null) {
            return List.of();
        }
        return tasks.stream().limit(hermesProperties.getMaxContextMessages()).toList();
    }

    private List<TaskCommentSummary> trimCommentList(List<TaskCommentSummary> comments) {
        if (comments == null || comments.isEmpty()) {
            return List.of();
        }
        int limit = hermesProperties.getMaxContextMessages();
        int fromIndex = Math.max(0, comments.size() - limit);
        return comments.subList(fromIndex, comments.size());
    }

    private HermesReferenceSummary projectReference(ProjectSummary project) {
        return new HermesReferenceSummary(
                "PROJECT",
                project.id(),
                defaultString(project.name()),
                "/projects/" + project.id() + "/iterations"
        );
    }

    private HermesReferenceSummary taskReference(TaskSummary task) {
        return new HermesReferenceSummary(
                "TASK",
                task.id(),
                defaultString(task.name()),
                "/projects/" + task.projectId() + "/iterations?openTaskId=" + task.id()
        );
    }

    private boolean isProjectScene(String routeName) {
        return "projects".equals(routeName)
                || "project-iterations".equals(routeName)
                || "project-knowledge-graph".equals(routeName);
    }

    private String normalizeRouteName(String routeName) {
        return routeName == null ? "" : routeName.trim();
    }

    private String resolveRoleName(CurrentUserInfo currentUser) {
        if (currentUser.roleNames() == null || currentUser.roleNames().isEmpty()) {
            return "协作成员";
        }
        return defaultString(currentUser.roleNames().get(0));
    }

    private String defaultDisplayName(CurrentUserInfo currentUser) {
        if (currentUser == null) {
            return "当前用户";
        }
        if (hasText(currentUser.nickname())) {
            return currentUser.nickname().trim();
        }
        return defaultString(currentUser.username());
    }

    private String defaultString(String value) {
        return value == null ? "" : value.trim();
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    /**
     * Hermes 需要的最小上下文载体，只保留问答真正需要的摘要信息。
     */
    public record HermesConversationContext(
            String sceneCode,
            Long projectId,
            Long taskId,
            String roleName,
            List<HermesReferenceSummary> references,
            List<String> suggestions,
            String contextMarkdown
    ) {
    }
}
