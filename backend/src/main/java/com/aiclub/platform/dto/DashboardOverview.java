package com.aiclub.platform.dto;

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
        ProjectBurndownSummary focusProjectBurndown
) {
}
