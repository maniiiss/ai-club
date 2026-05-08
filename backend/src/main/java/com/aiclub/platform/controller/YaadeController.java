package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.OperationLog;
import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.YaadeEmbedSessionSummary;
import com.aiclub.platform.dto.YaadeHealthSummary;
import com.aiclub.platform.dto.YaadeProjectBindingSummary;
import com.aiclub.platform.dto.request.YaadeEmbedSessionRequest;
import com.aiclub.platform.service.YaadeEmbedSessionService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Yaade 集成控制器。
 */
@RestController
@RequestMapping("/api/yaade")
@OperationLog(moduleCode = "YAADE", moduleName = "Yaade 集成", bizType = "YAADE")
public class YaadeController {

    private final YaadeEmbedSessionService yaadeEmbedSessionService;

    public YaadeController(YaadeEmbedSessionService yaadeEmbedSessionService) {
        this.yaadeEmbedSessionService = yaadeEmbedSessionService;
    }

    @GetMapping("/health")
    public ApiResponse<YaadeHealthSummary> health() {
        return ApiResponse.success(yaadeEmbedSessionService.getHealthSummary());
    }

    @PostMapping("/embed-sessions")
    @RequirePermission("api:view")
    @OperationLog(actionCode = "YAADE_EMBED_SESSION_CREATE", actionName = "创建 Yaade 嵌入会话")
    public ApiResponse<YaadeEmbedSessionSummary> createEmbedSession(@RequestBody(required = false) YaadeEmbedSessionRequest request,
                                                                    HttpServletRequest servletRequest,
                                                                    HttpServletResponse servletResponse) {
        Long projectId = request == null ? null : request.projectId();
        return ApiResponse.success(yaadeEmbedSessionService.createEmbedSession(projectId, servletRequest, servletResponse));
    }

    @GetMapping("/projects/{projectId}/binding")
    @RequirePermission("api:view")
    public ApiResponse<YaadeProjectBindingSummary> projectBinding(@PathVariable Long projectId) {
        return ApiResponse.success(yaadeEmbedSessionService.getProjectBindingSummary(projectId));
    }

    @PostMapping("/projects/{projectId}/repair-sync")
    @RequirePermission("api:manage")
    @OperationLog(actionCode = "YAADE_PROJECT_REPAIR_SYNC", actionName = "修复 Yaade 项目同步")
    public ApiResponse<YaadeProjectBindingSummary> repairProjectBinding(@PathVariable Long projectId) {
        return ApiResponse.success(yaadeEmbedSessionService.repairProjectBinding(projectId));
    }
}
