package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.OperationLog;
import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.ServerDetail;
import com.aiclub.platform.dto.ServerMetricSampleItem;
import com.aiclub.platform.dto.ServerSummary;
import com.aiclub.platform.dto.ServerTerminalSessionCreated;
import com.aiclub.platform.dto.request.ServerAlertConfigUpdateRequest;
import com.aiclub.platform.dto.request.ServerRequest;
import com.aiclub.platform.dto.request.ServerTerminalSessionCreateRequest;
import com.aiclub.platform.service.ServerManagementService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 平台级服务器管理控制器。
 */
@RestController
@RequestMapping("/api/servers")
@OperationLog(moduleCode = "SERVER", moduleName = "服务器管理", bizType = "SERVER")
public class ServerManagementController {

    private final ServerManagementService serverManagementService;

    public ServerManagementController(ServerManagementService serverManagementService) {
        this.serverManagementService = serverManagementService;
    }

    @GetMapping
    @RequirePermission("server:view")
    public ApiResponse<PageResponse<ServerSummary>> pageServers(@RequestParam(defaultValue = "1") int page,
                                                                @RequestParam(defaultValue = "12") int size,
                                                                @RequestParam(required = false) String keyword,
                                                                @RequestParam(required = false) Boolean enabled) {
        return ApiResponse.success(serverManagementService.pageServers(page, size, keyword, enabled));
    }

    @GetMapping("/{id}")
    @RequirePermission("server:view")
    public ApiResponse<ServerDetail> getServer(@PathVariable Long id) {
        return ApiResponse.success(serverManagementService.getServer(id));
    }

    @PostMapping
    @RequirePermission("server:manage")
    @OperationLog(actionCode = "SERVER_CREATE", actionName = "新增服务器")
    public ApiResponse<ServerDetail> createServer(@Valid @RequestBody ServerRequest request) {
        return ApiResponse.success(serverManagementService.createServer(request));
    }

    @PutMapping("/{id}")
    @RequirePermission("server:manage")
    @OperationLog(actionCode = "SERVER_UPDATE", actionName = "编辑服务器", bizIdParam = "id")
    public ApiResponse<ServerDetail> updateServer(@PathVariable Long id, @Valid @RequestBody ServerRequest request) {
        return ApiResponse.success(serverManagementService.updateServer(id, request));
    }

    @DeleteMapping("/{id}")
    @RequirePermission("server:manage")
    @OperationLog(actionCode = "SERVER_DELETE", actionName = "删除服务器", bizIdParam = "id")
    public ApiResponse<Void> deleteServer(@PathVariable Long id) {
        serverManagementService.deleteServer(id);
        return new ApiResponse<>(true, "Deleted successfully", null);
    }

    @PostMapping("/{id}/test-connection")
    @RequirePermission("server:manage")
    @OperationLog(actionCode = "SERVER_TEST_CONNECTION", actionName = "测试服务器连接", bizIdParam = "id")
    public ApiResponse<ServerSummary> testConnection(@PathVariable Long id) {
        return ApiResponse.success(serverManagementService.testConnection(id));
    }

    @GetMapping("/{id}/metrics/history")
    @RequirePermission("server:view")
    public ApiResponse<List<ServerMetricSampleItem>> listMetricsHistory(@PathVariable Long id) {
        return ApiResponse.success(serverManagementService.listMetricsHistory(id));
    }

    @PutMapping("/{id}/alerts")
    @RequirePermission("server:manage")
    @OperationLog(actionCode = "SERVER_UPDATE_ALERTS", actionName = "更新服务器告警配置", bizIdParam = "id")
    public ApiResponse<ServerDetail> updateAlertConfig(@PathVariable Long id,
                                                       @Valid @RequestBody ServerAlertConfigUpdateRequest request) {
        return ApiResponse.success(serverManagementService.updateAlertConfig(id, request));
    }

    @PostMapping("/{id}/terminal-sessions")
    @RequirePermission("server:terminal")
    @OperationLog(actionCode = "SERVER_CREATE_TERMINAL_SESSION", actionName = "创建服务器终端会话", bizIdParam = "id")
    public ApiResponse<ServerTerminalSessionCreated> createTerminalSession(@PathVariable Long id,
                                                                           @Valid @RequestBody(required = false) ServerTerminalSessionCreateRequest request,
                                                                           HttpServletRequest servletRequest) {
        return ApiResponse.success(serverManagementService.createTerminalSession(id, request, servletRequest.getRemoteAddr()));
    }
}
