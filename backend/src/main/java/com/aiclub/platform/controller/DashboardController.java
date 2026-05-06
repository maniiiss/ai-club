package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.AgentSummary;
import com.aiclub.platform.dto.DashboardCardOverview;
import com.aiclub.platform.dto.DashboardOverview;
import com.aiclub.platform.dto.DashboardStats;
import com.aiclub.platform.dto.DashboardShortcutEntrySummary;
import com.aiclub.platform.dto.DashboardShortcutOverview;
import com.aiclub.platform.dto.DashboardQuickTaskSummary;
import com.aiclub.platform.dto.ProjectSummary;
import com.aiclub.platform.dto.TaskSummary;
import com.aiclub.platform.dto.request.SaveDashboardShortcutEntriesRequest;
import com.aiclub.platform.dto.request.SaveDashboardQuickTasksRequest;
import com.aiclub.platform.service.DashboardShortcutEntryService;
import com.aiclub.platform.service.DashboardQuickTaskService;
import com.aiclub.platform.service.PlatformStoreService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/dashboard")
public class DashboardController {

    private final PlatformStoreService platformStoreService;
    private final DashboardQuickTaskService dashboardQuickTaskService;
    private final DashboardShortcutEntryService dashboardShortcutEntryService;

    public DashboardController(PlatformStoreService platformStoreService,
                               DashboardQuickTaskService dashboardQuickTaskService,
                               DashboardShortcutEntryService dashboardShortcutEntryService) {
        this.platformStoreService = platformStoreService;
        this.dashboardQuickTaskService = dashboardQuickTaskService;
        this.dashboardShortcutEntryService = dashboardShortcutEntryService;
    }

    @GetMapping("/overview")
    @RequirePermission("dashboard:view")
    public ApiResponse<DashboardOverview> overview() {
        return ApiResponse.success(platformStoreService.getDashboardOverview());
    }

    /**
     * 读取首页卡片基础概览，供前端按卡片维度并行加载。
     */
    @GetMapping("/cards/overview")
    @RequirePermission("dashboard:view")
    public ApiResponse<DashboardCardOverview> cardOverview() {
        return ApiResponse.success(platformStoreService.getDashboardCardOverview());
    }

    /**
     * 读取首页统计卡片数据。
     */
    @GetMapping("/cards/stats")
    @RequirePermission("dashboard:view")
    public ApiResponse<DashboardStats> cardStats() {
        return ApiResponse.success(platformStoreService.getDashboardCardOverview().stats());
    }

    /**
     * 读取首页活跃项目卡片数据。
     */
    @GetMapping("/cards/active-projects")
    @RequirePermission("dashboard:view")
    public ApiResponse<List<ProjectSummary>> cardActiveProjects() {
        return ApiResponse.success(platformStoreService.getDashboardCardOverview().activeProjects());
    }

    /**
     * 读取首页在线智能体卡片数据。
     */
    @GetMapping("/cards/online-agents")
    @RequirePermission("dashboard:view")
    public ApiResponse<List<AgentSummary>> cardOnlineAgents() {
        return ApiResponse.success(platformStoreService.getDashboardCardOverview().onlineAgents());
    }

    /**
     * 读取首页最近任务卡片数据。
     */
    @GetMapping("/cards/recent-tasks")
    @RequirePermission("dashboard:view")
    public ApiResponse<List<TaskSummary>> cardRecentTasks() {
        return ApiResponse.success(platformStoreService.getDashboardCardOverview().recentTasks());
    }

    /**
     * 读取首页快捷入口卡片数据。
     */
    @GetMapping("/cards/shortcut-overview")
    @RequirePermission("dashboard:view")
    public ApiResponse<DashboardShortcutOverview> cardShortcutOverview() {
        return ApiResponse.success(dashboardShortcutEntryService.getCurrentUserShortcutOverview());
    }

    /**
     * 读取当前登录用户的首页快捷任务。
     */
    @GetMapping("/quick-tasks")
    @RequirePermission("dashboard:view")
    public ApiResponse<List<DashboardQuickTaskSummary>> listQuickTasks() {
        return ApiResponse.success(dashboardQuickTaskService.listCurrentUserQuickTasks());
    }

    /**
     * 保存当前登录用户最新的首页快捷任务列表。
     */
    @PutMapping("/quick-tasks")
    @RequirePermission("dashboard:view")
    public ApiResponse<List<DashboardQuickTaskSummary>> saveQuickTasks(@Valid @RequestBody SaveDashboardQuickTasksRequest request) {
        return ApiResponse.success(dashboardQuickTaskService.saveCurrentUserQuickTasks(request));
    }

    /**
     * 读取当前登录用户自己的首页快捷入口。
     */
    @GetMapping("/shortcut-entries")
    @RequirePermission("dashboard:view")
    public ApiResponse<List<DashboardShortcutEntrySummary>> listShortcutEntries() {
        return ApiResponse.success(dashboardShortcutEntryService.listCurrentUserEntries());
    }

    /**
     * 保存当前登录用户最新的个人快捷入口列表。
     */
    @PutMapping("/shortcut-entries")
    @RequirePermission("dashboard:view")
    public ApiResponse<List<DashboardShortcutEntrySummary>> saveShortcutEntries(@Valid @RequestBody SaveDashboardShortcutEntriesRequest request) {
        return ApiResponse.success(dashboardShortcutEntryService.saveCurrentUserEntries(request));
    }
}
