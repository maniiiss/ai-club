package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.OperationLog;
import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.DashboardShortcutEntrySummary;
import com.aiclub.platform.dto.request.DashboardShortcutAdminRequest;
import com.aiclub.platform.service.DashboardShortcutEntryService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 系统管理-快捷入口管理控制器。
 */
@RestController
@RequestMapping("/api/dashboard-shortcut-entries")
@OperationLog(moduleCode = "SHORTCUT", moduleName = "快捷入口管理", bizType = "DASHBOARD_SHORTCUT_ENTRY")
public class DashboardShortcutEntryManagementController {

    private final DashboardShortcutEntryService dashboardShortcutEntryService;

    public DashboardShortcutEntryManagementController(DashboardShortcutEntryService dashboardShortcutEntryService) {
        this.dashboardShortcutEntryService = dashboardShortcutEntryService;
    }

    @GetMapping
    @RequirePermission("system:shortcut:view")
    public ApiResponse<List<DashboardShortcutEntrySummary>> list() {
        return ApiResponse.success(dashboardShortcutEntryService.listSystemEntries(false));
    }

    @PostMapping
    @RequirePermission("system:shortcut:manage")
    @OperationLog(actionCode = "SHORTCUT_ENTRY_CREATE", actionName = "新增快捷入口")
    public ApiResponse<DashboardShortcutEntrySummary> create(@Valid @RequestBody DashboardShortcutAdminRequest request) {
        return ApiResponse.success(dashboardShortcutEntryService.createSystemEntry(request));
    }

    @PutMapping("/{id}")
    @RequirePermission("system:shortcut:manage")
    @OperationLog(actionCode = "SHORTCUT_ENTRY_UPDATE", actionName = "更新快捷入口", bizIdParam = "id")
    public ApiResponse<DashboardShortcutEntrySummary> update(@PathVariable Long id,
                                                             @Valid @RequestBody DashboardShortcutAdminRequest request) {
        return ApiResponse.success(dashboardShortcutEntryService.updateSystemEntry(id, request));
    }

    @DeleteMapping("/{id}")
    @RequirePermission("system:shortcut:manage")
    @OperationLog(actionCode = "SHORTCUT_ENTRY_DELETE", actionName = "删除快捷入口", bizIdParam = "id")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        dashboardShortcutEntryService.deleteSystemEntry(id);
        return new ApiResponse<>(true, "Deleted successfully", null);
    }
}
