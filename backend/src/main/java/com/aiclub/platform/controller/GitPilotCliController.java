package com.aiclub.platform.controller;

import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.CurrentUserInfo;
import com.aiclub.platform.dto.cli.CliDtos;
import com.aiclub.platform.security.AuthContextHolder;
import com.aiclub.platform.service.GitPilotCliService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** GitPilot CLI 设备授权、模型目录和短期模型 session 接口。 */
@RestController
@RequestMapping("/api/cli")
public class GitPilotCliController {

    private final GitPilotCliService cliService;

    public GitPilotCliController(GitPilotCliService cliService) {
        this.cliService = cliService;
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
