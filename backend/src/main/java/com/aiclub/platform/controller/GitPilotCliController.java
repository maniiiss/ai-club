package com.aiclub.platform.controller;

import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.CreditAccountSummary;
import com.aiclub.platform.dto.CurrentUserInfo;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.cli.CliDtos;
import com.aiclub.platform.security.AuthContextHolder;
import com.aiclub.platform.service.GitPilotCliService;
import com.aiclub.platform.service.GitPilotWorkResearchService;
import com.aiclub.platform.service.PlatformStoreService;
import com.aiclub.platform.service.CreditService;
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
import java.util.Locale;

/** GitPilot CLI 设备授权、模型目录和短期模型 session 接口。 */
@RestController
@RequestMapping("/api/cli")
public class GitPilotCliController {

    private final GitPilotCliService cliService;
    private final PlatformStoreService platformStoreService;
    private final CreditService creditService;
    private final GitPilotWorkResearchService workResearchService;

    public GitPilotCliController(GitPilotCliService cliService,
                                 PlatformStoreService platformStoreService,
                                 CreditService creditService,
                                 GitPilotWorkResearchService workResearchService) {
        this.cliService = cliService;
        this.platformStoreService = platformStoreService;
        this.creditService = creditService;
        this.workResearchService = workResearchService;
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

    /**
     * 供桌面端账户菜单读取当前 CLI 登录用户的积分余额。
     * 该路由保留在 /api/cli 下，以确保仅已通过 gpt_ token 校验的 CLI 会话可读取本人账户。
     */
    @GetMapping("/me/credits")
    public ApiResponse<CreditAccountSummary> currentCredits() {
        return ApiResponse.success(creditService.getCurrentAccount());
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
     * 列出当前 CLI 用户可见的项目，供 Code/Work 的 /project 对话绑定使用。
     * 独立放在 /api/cli 下，确保 gpt_ CLI Token 不会被普通 Web JWT 校验链误判。
     */
    @GetMapping("/projects")
    public ApiResponse<List<CliDtos.CliProjectSummary>> projects(
            @RequestParam(required = false) String keyword) {
        var context = AuthContextHolder.get().orElseThrow();
        cliService.requireScope(context.token(), GitPilotCliService.SCOPE_PROJECT_READ);
        String normalizedKeyword = keyword == null ? "" : keyword.trim().toLowerCase(Locale.ROOT);
        List<CliDtos.CliProjectSummary> projects = platformStoreService.listAllProjects().stream()
                .filter(project -> normalizedKeyword.isBlank()
                        || project.name().toLowerCase(Locale.ROOT).contains(normalizedKeyword))
                .map(project -> new CliDtos.CliProjectSummary(
                        project.id(),
                        project.name(),
                        project.status(),
                        project.description(),
                        project.owner()))
                .toList();
        return ApiResponse.success(projects);
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

    /** Work 研究由服务端托管供应商密钥、限流和审计，CLI 只取得可引用摘要。 */
    @PostMapping("/work/research")
    public ApiResponse<CliDtos.WorkResearchResponse> workResearch(@RequestBody CliDtos.WorkResearchRequest request) {
        var ctx = AuthContextHolder.get().orElseThrow();
        cliService.requireScope(ctx.token(), GitPilotCliService.SCOPE_WORK_RESEARCH);
        return ApiResponse.success(new CliDtos.WorkResearchResponse(workResearchService.search(ctx.userId(), request == null ? "" : request.query())));
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
