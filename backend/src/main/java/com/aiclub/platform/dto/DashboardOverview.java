package com.aiclub.platform.dto;

import com.aiclub.platform.common.UserPosition;
import java.util.List;

public record DashboardOverview(
        DashboardStats stats,
        List<ProjectSummary> activeProjects,
        List<AgentSummary> onlineAgents,
        List<TaskSummary> recentTasks,
        DashboardShortcutOverview shortcutOverview,
        String currentUserGitlabUsername,
        List<GitlabAutoMergeLogSummary> currentUserGitlabMergeLogs,
        List<TaskSummary> myTasks,
        List<GitlabAutoMergeLogSummary> mergeAlerts,
        IterationBoardSummary focusIterationBoard,
        ProjectBurndownSummary focusProjectBurndown,
        /** 当前用户主定位；空值表示继续使用通用首页。 */
        UserPosition userPosition,
        /** 按用户定位计算的首页优先关注事项，已完成项目数据权限过滤。 */
        List<DashboardFocusItem> focusItems
) {
}
