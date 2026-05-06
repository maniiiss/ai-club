package com.aiclub.platform.dto;

import java.util.List;

/**
 * 首页卡片级概览数据。
 * 用于前端按卡片维度并行加载，避免整个首页必须等待聚合大接口全部完成。
 */
public record DashboardCardOverview(
        DashboardStats stats,
        List<ProjectSummary> activeProjects,
        List<AgentSummary> onlineAgents,
        List<TaskSummary> recentTasks,
        DashboardShortcutOverview shortcutOverview
) {
}
