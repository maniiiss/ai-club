package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.OperationLog;
import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.service.ServerManagementService;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 服务器终端会话关闭入口。
 */
@RestController
@RequestMapping("/api/server-terminal-sessions")
@OperationLog(moduleCode = "SERVER", moduleName = "服务器管理", bizType = "SERVER_TERMINAL_SESSION")
public class ServerTerminalSessionController {

    private final ServerManagementService serverManagementService;

    public ServerTerminalSessionController(ServerManagementService serverManagementService) {
        this.serverManagementService = serverManagementService;
    }

    @DeleteMapping("/{sessionId}")
    @RequirePermission("server:terminal")
    @OperationLog(actionCode = "SERVER_CLOSE_TERMINAL_SESSION", actionName = "关闭服务器终端会话")
    public ApiResponse<Void> closeSession(@PathVariable String sessionId) {
        serverManagementService.closeTerminalSession(sessionId);
        return new ApiResponse<>(true, "Closed successfully", null);
    }
}
