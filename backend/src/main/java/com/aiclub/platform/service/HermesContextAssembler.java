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
import com.aiclub.platform.dto.WikiSpaceDetail;
import com.aiclub.platform.dto.WikiSpacePageDetail;
import com.aiclub.platform.dto.WikiSpacePageSummary;
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
    private final WikiSpaceService wikiSpaceService;

    public HermesContextAssembler(PlatformStoreService platformStoreService,
                                  NotificationService notificationService,
                                  TaskAgentRunService taskAgentRunService,
                                  HermesProperties hermesProperties,
                                  WikiSpaceService wikiSpaceService) {
        this.platformStoreService = platformStoreService;
        this.notificationService = notificationService;
        this.taskAgentRunService = taskAgentRunService;
        this.hermesProperties = hermesProperties;
        this.wikiSpaceService = wikiSpaceService;
    }

    /**
     * 根据路由、项目和任务信息选择最合适的上下文装配策略。
     */
    public HermesConversationContext assemble(HermesChatRequest request, CurrentUserInfo currentUser) {
        String routeName = normalizeRouteName(request.routeName());
        try {
            if (request.wikiSpaceId() != null && request.wikiPageId() != null) {
                return buildWikiPageContext(routeName, request.wikiSpaceId(), request.wikiPageId(), currentUser);
            }
            if (request.wikiSpaceId() != null) {
                return buildWikiSpaceContext(routeName, request.wikiSpaceId(), currentUser);
            }
            if (request.taskId() != null) {
                return buildTaskContext(routeName, request.taskId(), currentUser);
            }
            if (request.projectId() != null && request.iterationId() != null) {
                return buildIterationContext(routeName, request.projectId(), request.iterationId(), currentUser);
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
                null,
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
                null,
                null,
                resolveRoleName(currentUser),
                references,
                List.of("这个任务为什么延期了", "这个任务上次讨论到哪了", "我接手这个任务应该先看什么"),
                context.toString()
        );
    }

    /**
     * 迭代详情页要优先输出“当前迭代”视角，而不是退化成整个项目摘要。
     * 这样 Hermes 在回答发版内容、缺陷修复数量和需求清单时，可以直接基于当前迭代上下文作答。
     */
    private HermesConversationContext buildIterationContext(String routeName,
                                                            Long projectId,
                                                            Long iterationId,
                                                            CurrentUserInfo currentUser) {
        ProjectSummary project = platformStoreService.getProject(projectId);
        IterationSummary iteration = platformStoreService.listProjectIterations(projectId).stream()
                .filter(item -> item.id() != null && item.id().equals(iterationId))
                .findFirst()
                .orElseThrow(() -> new NoSuchElementException("迭代不存在: " + iterationId));
        List<TaskSummary> iterationWorkItems = platformStoreService.listProjectWorkItems(projectId, iterationId, null, null, null);
        List<TaskSummary> displayWorkItems = iterationWorkItems.stream()
                .limit(hermesProperties.getMaxContextMessages())
                .toList();

        long deliveredCount = iterationWorkItems.stream().filter(task -> isDeliveredStatus(task.status())).count();
        long openCount = Math.max(iterationWorkItems.size() - deliveredCount, 0);
        long requirementCount = countWorkItemsByType(iterationWorkItems, "需求");
        long taskCount = countWorkItemsByType(iterationWorkItems, "任务");
        long defectCount = countWorkItemsByType(iterationWorkItems, "缺陷");

        List<HermesReferenceSummary> references = new ArrayList<>();
        references.add(projectReference(project));
        references.add(iterationReference(iteration));
        for (TaskSummary task : displayWorkItems.stream().limit(3).toList()) {
            references.add(taskReference(task));
        }

        StringBuilder context = new StringBuilder();
        context.append("## 当前场景\n")
                .append("迭代详情\n\n")
                .append("## 当前用户\n")
                .append("昵称：").append(defaultDisplayName(currentUser)).append('\n')
                .append("角色：").append(resolveRoleName(currentUser)).append("\n\n")
                .append("## 当前项目\n")
                .append("项目名称：").append(defaultString(project.name())).append('\n')
                .append("项目状态：").append(defaultString(project.status())).append('\n')
                .append("负责人：").append(defaultString(project.owner())).append("\n\n")
                .append("## 当前迭代\n")
                .append("迭代名称：").append(defaultString(iteration.name())).append('\n')
                .append("迭代状态：").append(defaultString(iteration.status())).append('\n')
                .append("迭代目标：").append(defaultString(iteration.goal())).append('\n')
                .append("开始日期：").append(defaultString(iteration.startDate())).append('\n')
                .append("结束日期：").append(defaultString(iteration.endDate())).append('\n')
                .append("工作项总数：").append(iterationWorkItems.size()).append("\n\n")
                .append("## 发版内容速览\n")
                .append("- 已完成 / 已通过：").append(deliveredCount).append('\n')
                .append("- 待跟进：").append(openCount).append('\n')
                .append("- 需求：").append(requirementCount).append('\n')
                .append("- 任务：").append(taskCount).append('\n')
                .append("- 缺陷：").append(defectCount).append("\n\n")
                .append("## 当前迭代工作项\n");
        appendIterationWorkItems(context, displayWorkItems);

        return new HermesConversationContext(
                "project-iterations".equals(routeName) ? routeName : "iteration",
                project.id(),
                null,
                null,
                null,
                resolveRoleName(currentUser),
                references,
                List.of("帮我总结当前迭代发版内容", "这个迭代还有哪些风险", "当前迭代哪些缺陷最值得优先关注"),
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
                null,
                null,
                resolveRoleName(currentUser),
                List.of(new HermesReferenceSummary("GLOBAL", null, "全局工作台", "/dashboard")),
                List.of("我今天最该推进什么", "帮我总结当前最值得关注的事项", "最近有哪些需要我关注的异常"),
                context.toString()
        );
    }

    /**
     * Wiki 页面场景聚合当前空间、当前页面和相关页面，方便 Hermes 基于空间知识作答。
     */
    private HermesConversationContext buildWikiPageContext(String routeName, Long spaceId, Long wikiPageId, CurrentUserInfo currentUser) {
        WikiSpaceDetail space = wikiSpaceService.getSpaceDetail(spaceId);
        WikiSpacePageDetail page = wikiSpaceService.getPageDetail(spaceId, wikiPageId);
        List<WikiSpacePageSummary> relatedPages = wikiSpaceService.relatedPages(spaceId, wikiPageId, hermesProperties.getMaxContextMessages());
        List<HermesReferenceSummary> references = new ArrayList<>();
        references.add(wikiSpaceReference(space.id(), space.name()));
        references.add(wikiPageReference(page.id(), spaceId, page.title()));
        for (WikiSpacePageSummary relatedPage : relatedPages.stream().limit(3).toList()) {
            references.add(wikiPageReference(relatedPage.id(), spaceId, relatedPage.title()));
        }
        StringBuilder context = new StringBuilder();
        context.append("## 当前场景\n")
                .append("Wiki 空间页面\n\n")
                .append("## 当前用户\n")
                .append("昵称：").append(defaultDisplayName(currentUser)).append('\n')
                .append("角色：").append(resolveRoleName(currentUser)).append("\n\n")
                .append("## Wiki 问答提示\n")
                .append("当前页面正文摘要已经随上下文提供；如果用户继续追问细节、引用原文或要求跨页对比，应继续查询相关 Wiki 页面或读取页面详情。\n\n")
                .append("## 当前空间\n")
                .append("空间名称：").append(defaultString(space.name())).append('\n')
                .append("空间ID：").append(space.id()).append('\n')
                .append("读取范围：").append(defaultString(space.readScope())).append("\n\n")
                .append("## 当前 Wiki 页面\n")
                .append("页面ID：").append(page.id()).append('\n')
                .append("标题：").append(defaultString(page.title())).append('\n')
                .append("目录：").append(defaultString(page.directoryName())).append('\n')
                .append("版本：v").append(page.currentVersionNumber()).append('\n')
                .append("正文摘要：").append(abbreviate(page.content(), 2400)).append("\n\n")
                .append("## 相关 Wiki 页面\n");
        appendWikiPages(context, relatedPages);
        return new HermesConversationContext(
                "wiki-space-page".equals(routeName) ? routeName : "wiki-page",
                null,
                null,
                spaceId,
                wikiPageId,
                resolveRoleName(currentUser),
                references,
                List.of("帮我总结当前 Wiki 页面", "这个页面和哪些知识有关", "基于 Wiki 内容下一步应该做什么"),
                context.toString()
        );
    }

    /**
     * Wiki 空间场景聚合空间摘要和最近页面，方便 Hermes 从知识空间视角作答。
     */
    private HermesConversationContext buildWikiSpaceContext(String routeName, Long spaceId, CurrentUserInfo currentUser) {
        WikiSpaceDetail space = wikiSpaceService.getSpaceDetail(spaceId);
        List<WikiSpacePageSummary> recentPages = wikiSpaceService.searchPages("", spaceId, null).stream()
                .limit(hermesProperties.getMaxContextMessages())
                .toList();
        List<HermesReferenceSummary> references = new ArrayList<>();
        references.add(wikiSpaceReference(space.id(), space.name()));
        for (WikiSpacePageSummary page : recentPages.stream().limit(3).toList()) {
            references.add(wikiPageReference(page.id(), spaceId, page.title()));
        }
        StringBuilder context = new StringBuilder();
        context.append("## 当前场景\n")
                .append("Wiki 空间\n\n")
                .append("## 当前用户\n")
                .append("昵称：").append(defaultDisplayName(currentUser)).append('\n')
                .append("角色：").append(resolveRoleName(currentUser)).append("\n\n")
                .append("## Wiki 问答提示\n")
                .append("当前空间已附带最近页面列表；如果用户需要具体页面内容、摘要或比对结果，应继续读取对应 Wiki 页面详情。\n\n")
                .append("## 空间摘要\n")
                .append("空间名称：").append(defaultString(space.name())).append('\n')
                .append("空间说明：").append(defaultString(space.description())).append('\n')
                .append("读取范围：").append(defaultString(space.readScope())).append('\n')
                .append("页面数量：").append(space.pageCount()).append("\n\n")
                .append("## 最近页面\n");
        appendWikiPages(context, recentPages);
        return new HermesConversationContext(
                "wiki-space".equals(routeName) ? routeName : "wiki-space",
                null,
                null,
                spaceId,
                null,
                resolveRoleName(currentUser),
                references,
                List.of("这个空间最近有哪些知识更新", "帮我梳理这个空间里的重点内容", "这个空间目前最值得关注的页面是什么"),
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

    /**
     * 迭代摘要里保留编号、类型和状态，便于 Hermes 直接生成发版说明而不必再次搜索对象。
     */
    private void appendIterationWorkItems(StringBuilder builder, List<TaskSummary> tasks) {
        if (tasks == null || tasks.isEmpty()) {
            builder.append("- 当前迭代暂无工作项\n");
            return;
        }
        for (TaskSummary task : tasks) {
            builder.append("- ")
                    .append(defaultString(task.workItemCode()))
                    .append(' ')
                    .append(defaultString(task.name()))
                    .append(" / 类型：").append(defaultString(task.workItemType()))
                    .append(" / 状态：").append(defaultString(task.status()))
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

    private void appendWikiPages(StringBuilder builder, List<WikiSpacePageSummary> pages) {
        if (pages == null || pages.isEmpty()) {
            builder.append("- 暂无相关 Wiki 页面\n");
            return;
        }
        for (WikiSpacePageSummary page : pages.stream().limit(hermesProperties.getMaxContextMessages()).toList()) {
            builder.append("- ")
                    .append(defaultString(page.title()))
                    .append(" / 目录：").append(defaultString(page.directoryName()))
                    .append(" / 版本：v").append(page.currentVersionNumber())
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

    private HermesReferenceSummary iterationReference(IterationSummary iteration) {
        return new HermesReferenceSummary(
                "ITERATION",
                iteration.id(),
                defaultString(iteration.name()),
                "/projects/" + iteration.projectId() + "/iterations?iterationId=" + iteration.id()
        );
    }

    private HermesReferenceSummary wikiSpaceReference(Long spaceId, String title) {
        return new HermesReferenceSummary(
                "WIKI_SPACE",
                spaceId,
                defaultString(title),
                "/wiki/spaces/" + spaceId
        );
    }

    private HermesReferenceSummary wikiPageReference(Long pageId, Long spaceId, String title) {
        return new HermesReferenceSummary(
                "WIKI_PAGE",
                pageId,
                defaultString(title),
                "/wiki/spaces/" + spaceId + "/pages/" + pageId
        );
    }

    private boolean isProjectScene(String routeName) {
        return "projects".equals(routeName)
                || "project-iterations".equals(routeName)
                || "project-knowledge-graph".equals(routeName)
                || "project-memory-fact-graph".equals(routeName);
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

    private long countWorkItemsByType(List<TaskSummary> tasks, String workItemType) {
        if (tasks == null || tasks.isEmpty()) {
            return 0L;
        }
        return tasks.stream()
                .filter(task -> workItemType.equals(defaultString(task.workItemType())))
                .count();
    }

    /**
     * 发版摘要更关心“已完成 / 已通过 / 已关闭”这类可对外说明的状态，统一在这里做轻量归一。
     */
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

    private String abbreviate(String value, int maxLength) {
        String normalized = defaultString(value);
        if (normalized.length() <= maxLength) {
            return normalized;
        }
        return normalized.substring(0, Math.max(0, maxLength - 3)) + "...";
    }

    /**
     * Hermes 需要的最小上下文载体，只保留问答真正需要的摘要信息。
     */
    public record HermesConversationContext(
            String sceneCode,
            Long projectId,
            Long taskId,
            Long wikiSpaceId,
            Long wikiPageId,
            String roleName,
            List<HermesReferenceSummary> references,
            List<String> suggestions,
            String contextMarkdown
    ) {
        /**
         * 兼容旧测试构造方式。
         */
        public HermesConversationContext(String sceneCode,
                                         Long projectId,
                                         Long taskId,
                                         String roleName,
                                         List<HermesReferenceSummary> references,
                                         List<String> suggestions,
                                         String contextMarkdown) {
            this(sceneCode, projectId, taskId, null, null, roleName, references, suggestions, contextMarkdown);
        }
    }
}
