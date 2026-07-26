package com.aiclub.platform.controller;

import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.CurrentUserInfo;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.cli.CliDtos;
import com.aiclub.platform.security.AuthContextHolder;
import com.aiclub.platform.service.GitPilotCliService;
import com.aiclub.platform.service.PlatformStoreService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** GitPilot CLI 设备授权、模型目录和短期模型 session 接口。 */
@RestController
@RequestMapping("/api/cli")
public class GitPilotCliController {

    private final GitPilotCliService cliService;
    private final PlatformStoreService platformStoreService;

    public GitPilotCliController(GitPilotCliService cliService, PlatformStoreService platformStoreService) {
        this.cliService = cliService;
        this.platformStoreService = platformStoreService;
    }

    @PostMapping("/device/authorizations")
    public ApiResponse<CliDtos.DeviceAuthorizationResponse> createDeviceAuthorization(
            @RequestBody(required = false) CliDtos.DeviceAuthorizationRequest request) {
        return ApiResponse.success(cliService.createDeviceAuthorization(request == null ? "" : request.clientVersion()));
    }

    @PostMapping("/device/authorizations/{userCode}/approve")
    public ApiResponse<CliDtos.DeviceApprovalResponse> approveDevice(@PathVariable String userCode) {
        cliService.approveDevice(userCode);
        return ApiResponse.success(new CliDtos.DeviceApprovalResponse(userCode, true));
    }

    @PostMapping("/device/token")
    public ResponseEntity<ApiResponse<CliDtos.CliTokenResponse>> pollDeviceToken(
            @RequestBody CliDtos.DeviceTokenRequest request) {
        GitPilotCliService.DeviceTokenPoll poll = cliService.pollDeviceToken(request.deviceCode());
        if (poll.status() == GitPilotCliService.DeviceTokenStatus.PENDING) {
            return ResponseEntity.status(HttpStatus.PRECONDITION_REQUIRED)
                    .body(new ApiResponse<>(false, "authorization_pending", null));
        }
        if (poll.status() == GitPilotCliService.DeviceTokenStatus.EXPIRED) {
            return ResponseEntity.status(HttpStatus.GONE)
                    .body(new ApiResponse<>(false, "expired_token", null));
        }
        return ResponseEntity.ok(ApiResponse.success(poll.response()));
    }

    @GetMapping("/me")
    public ApiResponse<CurrentUserInfo> currentUser() {
        Long userId = AuthContextHolder.get().orElseThrow().userId();
        return ApiResponse.success(cliServiceUser(userId));
    }

    @PostMapping("/logout")
    public ApiResponse<Void> logout(@RequestHeader(value = "Authorization", required = false) String authorization) {
        cliService.revoke(cliService.normalizeAuthorization(authorization));
        return new ApiResponse<>(true, "ok", null);
    }

    @GetMapping("/models")
    public ApiResponse<List<CliDtos.CliModelSummary>> models() {
        String token = AuthContextHolder.get().orElseThrow().token();
        cliService.requireScope(token, GitPilotCliService.SCOPE_MODEL_READ);
        return ApiResponse.success(cliService.listModels());
    }

    /**
     * 列出当前 CLI 用户负责的需求（workItemType=需求），供 /requirement 命令使用。
     * 复用 gpt_ token 认证与 scope 校验，负责人取当前登录用户，绕过项目可见性以覆盖“分配给我但未参与的项目”。
     */
    @GetMapping("/tasks")
    public ApiResponse<PageResponse<CliDtos.CliTaskSummary>> myTasks(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "50") int size,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String priority,
            @RequestParam(required = false) Long projectId,
            @RequestParam(required = false) String keyword) {
        var ctx = AuthContextHolder.get().orElseThrow();
        cliService.requireScope(ctx.token(), GitPilotCliService.SCOPE_TASK_READ);
        Long me = ctx.userId();
        return ApiResponse.success(platformStoreService.pageMyRequirementTasks(me, page, size, status, priority, projectId, keyword));
    }

    @PostMapping("/model-sessions")
    public ApiResponse<CliDtos.ModelSessionResponse> createModelSession(
            @RequestBody CliDtos.ModelSessionRequest request,
            HttpServletRequest servletRequest) {
        String baseUrl = requestBaseUrl(servletRequest) + "/api/cli/model-sessions";
        return ApiResponse.success(cliService.createModelSession(request.modelConfigId(), request.clientVersion(), baseUrl));
    }

    private CurrentUserInfo cliServiceUser(Long userId) {
        // 通过当前认证 Token 的用户上下文读取最新资料，避免控制器直接依赖用户 Repository。
        return cliService.currentUser(userId);
    }

    private String requestBaseUrl(HttpServletRequest request) {
        String scheme = request.getHeader("X-Forwarded-Proto");
        if (scheme == null || scheme.isBlank()) scheme = request.getScheme();
        String host = request.getHeader("X-Forwarded-Host");
        if (host == null || host.isBlank()) host = request.getServerName() + ":" + request.getServerPort();
        return scheme + "://" + host;
    }
}
