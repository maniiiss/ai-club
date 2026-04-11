package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.DashboardOverview;
import com.aiclub.platform.dto.DashboardQuickTaskSummary;
import com.aiclub.platform.dto.request.SaveDashboardQuickTasksRequest;
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

    public DashboardController(PlatformStoreService platformStoreService,
                               DashboardQuickTaskService dashboardQuickTaskService) {
        this.platformStoreService = platformStoreService;
        this.dashboardQuickTaskService = dashboardQuickTaskService;
    }

    @GetMapping("/overview")
    @RequirePermission("dashboard:view")
    public ApiResponse<DashboardOverview> overview() {
        return ApiResponse.success(platformStoreService.getDashboardOverview());
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
}
