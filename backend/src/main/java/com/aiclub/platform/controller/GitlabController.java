package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.GitlabAutoMergeConfigSummary;
import com.aiclub.platform.dto.GitlabAutoMergeLogSummary;
import com.aiclub.platform.dto.GitlabAutoMergeLogIssueFeedbackSummary;
import com.aiclub.platform.dto.GitlabAutoMergeProjectShareSummary;
import com.aiclub.platform.dto.GitlabAutoMergePublicLogPage;
import com.aiclub.platform.dto.GitlabAutoMergeWebhookSummary;
import com.aiclub.platform.dto.GitlabApiSyncResult;
import com.aiclub.platform.dto.GitlabAutoMergeRunResult;
import com.aiclub.platform.dto.GitlabBranchSummary;
import com.aiclub.platform.dto.GitlabCodeStructureQueryResult;
import com.aiclub.platform.dto.GitlabCodeStructureRefreshAcceptedResult;
import com.aiclub.platform.dto.GitlabCodeStructureSnapshotSummary;
import com.aiclub.platform.dto.GitlabCreateMergeRequestResult;
import com.aiclub.platform.dto.GitlabGitnexusLaunchResult;
import com.aiclub.platform.dto.GitlabMergeRequestSummary;
import com.aiclub.platform.dto.GitlabProductBranchSummary;
import com.aiclub.platform.dto.GitlabProductBranchSyncLogSummary;
import com.aiclub.platform.dto.GitlabProductBranchSyncRunResult;
import com.aiclub.platform.dto.GitlabTagCreateResult;
import com.aiclub.platform.dto.GitlabUserOauthAuthorizeResult;
import com.aiclub.platform.dto.GitlabUserOauthBindingSummary;
import com.aiclub.platform.dto.GitlabUserSummary;
import com.aiclub.platform.dto.ExecutionTaskSummary;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.ProjectGitlabBindingSummary;
import com.aiclub.platform.dto.ProjectPublicPipelineRunPage;
import com.aiclub.platform.dto.ProjectPublicPipelineSummary;
import com.aiclub.platform.dto.RepositoryScanRulesetSummary;
import com.aiclub.platform.dto.request.GitlabAutoMergeConfigRequest;
import com.aiclub.platform.dto.request.GitlabAutoMergeLogIssueFeedbackRequest;
import com.aiclub.platform.dto.request.GitlabAutoMergeProjectShareRequest;
import com.aiclub.platform.dto.request.GitlabAutoMergeWebhookRequest;
import com.aiclub.platform.dto.request.GitlabApiSyncRequest;
import com.aiclub.platform.dto.request.GitlabCreateProductBranchSyncRequest;
import com.aiclub.platform.dto.request.GitlabBindingScanTaskRequest;
import com.aiclub.platform.dto.request.GitlabCodeStructureQueryRequest;
import com.aiclub.platform.dto.request.GitlabCodeStructureRefreshRequest;
import com.aiclub.platform.dto.request.GitlabCreateMergeRequestRequest;
import com.aiclub.platform.dto.request.GitlabGitnexusLaunchRequest;
import com.aiclub.platform.dto.request.GitlabProductBranchRequest;
import com.aiclub.platform.dto.request.GitlabTagCreateRequest;
import com.aiclub.platform.dto.request.GitlabUserOauthAuthorizeRequest;
import com.aiclub.platform.dto.request.GitlabUserOauthCallbackRequest;
import com.aiclub.platform.dto.request.ProjectGitlabBindingRequest;
import com.aiclub.platform.service.GitlabApiSyncService;
import com.aiclub.platform.service.GitlabManagementService;
import com.aiclub.platform.service.GitlabUserOauthService;
import jakarta.validation.Valid;
import jakarta.servlet.http.HttpServletRequest;
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

@RestController
@RequestMapping("/api/gitlab")
public class GitlabController {

    private final GitlabManagementService gitlabManagementService;
    private final GitlabUserOauthService gitlabUserOauthService;
    private final GitlabApiSyncService gitlabApiSyncService;

    public GitlabController(GitlabManagementService gitlabManagementService,
                            GitlabUserOauthService gitlabUserOauthService,
                            GitlabApiSyncService gitlabApiSyncService) {
        this.gitlabManagementService = gitlabManagementService;
        this.gitlabUserOauthService = gitlabUserOauthService;
        this.gitlabApiSyncService = gitlabApiSyncService;
    }

    /**
     * 返回当前登录用户在默认 GitLab 实例上的 OAuth 绑定状态。
     */
    @GetMapping("/user-oauth-binding")
    public ApiResponse<GitlabUserOauthBindingSummary> getCurrentUserOauthBinding() {
        return ApiResponse.success(gitlabUserOauthService.getCurrentUserBindingSummary());
    }

    /**
     * 为当前登录用户生成 GitLab OAuth 授权地址。
     */
    @PostMapping("/user-oauth-binding/authorize")
    public ApiResponse<GitlabUserOauthAuthorizeResult> createCurrentUserOauthAuthorizeUrl(
            @Valid @RequestBody GitlabUserOauthAuthorizeRequest request) {
        return ApiResponse.success(gitlabUserOauthService.createAuthorizeUrl(request));
    }

    /**
     * 处理 GitLab OAuth 授权回调。
     */
    @PostMapping("/user-oauth-binding/callback")
    public ApiResponse<GitlabUserOauthBindingSummary> handleCurrentUserOauthCallback(
            @Valid @RequestBody GitlabUserOauthCallbackRequest request) {
        return ApiResponse.success(gitlabUserOauthService.handleOauthCallback(request));
    }

    /**
     * 解绑当前登录用户的 GitLab OAuth 绑定。
     */
    @DeleteMapping("/user-oauth-binding")
    public ApiResponse<Void> deleteCurrentUserOauthBinding() {
        gitlabUserOauthService.unbindCurrentUser();
        return new ApiResponse<>(true, "Deleted successfully", null);
    }

    @GetMapping("/bindings")
    @RequirePermission("gitlab:view")
    public ApiResponse<PageResponse<ProjectGitlabBindingSummary>> pageBindings(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) Long projectId
    ) {
        return ApiResponse.success(gitlabManagementService.pageBindings(page, size, keyword, projectId));
    }

    @GetMapping("/bindings/options")
    @RequirePermission("gitlab:view")
    public ApiResponse<List<ProjectGitlabBindingSummary>> bindingOptions() {
        return ApiResponse.success(gitlabManagementService.listBindingOptions());
    }

    /**
     * 返回仓库规范扫描可选规则集。
     */
    @GetMapping("/scan-rulesets")
    @RequirePermission("gitlab:view")
    public ApiResponse<List<RepositoryScanRulesetSummary>> listScanRulesets() {
        return ApiResponse.success(gitlabManagementService.listScanRulesets());
    }

    @PostMapping("/bindings")
    @RequirePermission("gitlab:manage")
    public ApiResponse<ProjectGitlabBindingSummary> createBinding(@Valid @RequestBody ProjectGitlabBindingRequest request) {
        return ApiResponse.success(gitlabManagementService.createBinding(request));
    }

    @PutMapping("/bindings/{id}")
    @RequirePermission("gitlab:manage")
    public ApiResponse<ProjectGitlabBindingSummary> updateBinding(@PathVariable Long id,
                                                                  @Valid @RequestBody ProjectGitlabBindingRequest request) {
        return ApiResponse.success(gitlabManagementService.updateBinding(id, request));
    }

    @DeleteMapping("/bindings/{id}")
    @RequirePermission("gitlab:manage")
    public ApiResponse<Void> deleteBinding(@PathVariable Long id) {
        gitlabManagementService.deleteBinding(id);
        return new ApiResponse<>(true, "Deleted successfully", null);
    }

    @PostMapping("/bindings/{id}/test")
    @RequirePermission("gitlab:manage")
    public ApiResponse<ProjectGitlabBindingSummary> testBinding(@PathVariable Long id) {
        return ApiResponse.success(gitlabManagementService.testBinding(id));
    }

    /**
     * 基于指定绑定仓库创建一条仓库规范扫描任务。
     */
    @PostMapping("/bindings/{id}/scan-tasks")
    @RequirePermission("gitlab:manage")
    public ApiResponse<ExecutionTaskSummary> createBindingScanTask(@PathVariable Long id,
                                                                   @Valid @RequestBody GitlabBindingScanTaskRequest request) {
        return ApiResponse.success(gitlabManagementService.createBindingScanTask(id, request));
    }

    /**
     * 从后端或混合仓库抽取 Spring 接口，并同步为 Yaade API 请求。
     */
    @PostMapping("/bindings/{id}/api-sync")
    @RequirePermission("gitlab:manage")
    public ApiResponse<GitlabApiSyncResult> syncBindingApi(@PathVariable Long id,
                                                           @Valid @RequestBody(required = false) GitlabApiSyncRequest request) {
        return ApiResponse.success(gitlabApiSyncService.syncBindingApi(id, request));
    }

    @GetMapping("/bindings/{id}/merge-requests")
    @RequirePermission("gitlab:view")
    public ApiResponse<List<GitlabMergeRequestSummary>> previewBindingMergeRequests(@PathVariable Long id,
                                                                                     @RequestParam(required = false) String targetBranch) {
        return ApiResponse.success(gitlabManagementService.previewBindingMergeRequests(id, targetBranch));
    }

    /**
     * 查询指定绑定仓库的分支列表，供前端远程搜索使用。
     */
    @GetMapping("/bindings/{id}/branches")
    @RequirePermission("gitlab:manage")
    public ApiResponse<List<GitlabBranchSummary>> listBindingBranches(@PathVariable Long id,
                                                                      @RequestParam(required = false) String search) {
        return ApiResponse.success(gitlabManagementService.listBindingBranches(id, search));
    }

    /**
     * 用户管理页绑定 GitLab 账号时远程搜索用户候选。
     */
    @GetMapping("/users")
    @RequirePermission("system:user:manage")
    public ApiResponse<List<GitlabUserSummary>> listUsers(@RequestParam(required = false) String keyword) {
        return ApiResponse.success(gitlabManagementService.listGitlabUsers(keyword));
    }

    /**
     * 读取绑定仓库在指定分支上的代码结构快照。
     */
    @GetMapping("/bindings/{id}/code-structure")
    @RequirePermission("gitlab:view")
    public ApiResponse<GitlabCodeStructureSnapshotSummary> getBindingCodeStructure(@PathVariable Long id,
                                                                                   @RequestParam(required = false) String branch) {
        return ApiResponse.success(gitlabManagementService.getBindingCodeStructure(id, branch));
    }

    /**
     * 后台刷新绑定仓库的代码结构快照。
     */
    @PostMapping("/bindings/{id}/code-structure/refresh")
    @RequirePermission("gitlab:manage")
    public ApiResponse<GitlabCodeStructureRefreshAcceptedResult> refreshBindingCodeStructure(@PathVariable Long id,
                                                                                              @Valid @RequestBody GitlabCodeStructureRefreshRequest request) {
        return ApiResponse.success(gitlabManagementService.refreshBindingCodeStructure(id, request));
    }

    /**
     * 基于已缓存的 GitNexus 索引执行局部查询。
     */
    @PostMapping("/bindings/{id}/code-structure/query")
    @RequirePermission("gitlab:view")
    public ApiResponse<GitlabCodeStructureQueryResult> queryBindingCodeStructure(@PathVariable Long id,
                                                                                 @Valid @RequestBody GitlabCodeStructureQueryRequest request) {
        return ApiResponse.success(gitlabManagementService.queryBindingCodeStructure(id, request));
    }

    /**
     * 为前端准备 GitNexus 全仓图跳转地址。
     */
    @PostMapping("/bindings/{id}/gitnexus-launch")
    @RequirePermission("gitlab:view")
    public ApiResponse<GitlabGitnexusLaunchResult> launchBindingGitnexus(@PathVariable Long id,
                                                                         @Valid @RequestBody GitlabGitnexusLaunchRequest request,
                                                                         HttpServletRequest servletRequest) {
        return ApiResponse.success(gitlabManagementService.launchBindingGitnexus(
                id,
                request,
                resolveRequestScheme(servletRequest),
                resolveRequestHost(servletRequest)
        ));
    }

    @GetMapping("/bindings/{id}/product-branches")
    @RequirePermission("gitlab:view")
    public ApiResponse<List<GitlabProductBranchSummary>> listProductBranches(@PathVariable Long id) {
        return ApiResponse.success(gitlabManagementService.listProductBranches(id));
    }

    @PostMapping("/bindings/{id}/product-branches")
    @RequirePermission("gitlab:manage")
    public ApiResponse<GitlabProductBranchSummary> createProductBranch(@PathVariable Long id,
                                                                       @Valid @RequestBody GitlabProductBranchRequest request) {
        return ApiResponse.success(gitlabManagementService.createProductBranch(id, request));
    }

    @PutMapping("/bindings/{id}/product-branches/{branchId}")
    @RequirePermission("gitlab:manage")
    public ApiResponse<GitlabProductBranchSummary> updateProductBranch(@PathVariable Long id,
                                                                       @PathVariable Long branchId,
                                                                       @Valid @RequestBody GitlabProductBranchRequest request) {
        return ApiResponse.success(gitlabManagementService.updateProductBranch(id, branchId, request));
    }

    @DeleteMapping("/bindings/{id}/product-branches/{branchId}")
    @RequirePermission("gitlab:manage")
    public ApiResponse<Void> deleteProductBranch(@PathVariable Long id, @PathVariable Long branchId) {
        gitlabManagementService.deleteProductBranch(id, branchId);
        return new ApiResponse<>(true, "Deleted successfully", null);
    }

    @GetMapping("/bindings/{id}/product-branches/sync-logs")
    @RequirePermission("gitlab:view")
    public ApiResponse<List<GitlabProductBranchSyncLogSummary>> listProductBranchSyncLogs(@PathVariable Long id) {
        return ApiResponse.success(gitlabManagementService.listProductBranchSyncLogs(id));
    }

    @PostMapping("/bindings/{id}/product-branches/sync-merge-requests")
    @RequirePermission("gitlab:manage")
    public ApiResponse<GitlabProductBranchSyncRunResult> createProductBranchSyncMergeRequests(
            @PathVariable Long id,
            @Valid @RequestBody GitlabCreateProductBranchSyncRequest request) {
        return ApiResponse.success(gitlabManagementService.createProductBranchSyncMergeRequests(id, request));
    }

    private String resolveRequestScheme(HttpServletRequest request) {
        String forwardedProto = trimHeaderValue(request.getHeader("X-Forwarded-Proto"));
        if (forwardedProto != null) {
            return forwardedProto;
        }
        return request.getScheme();
    }

    private String resolveRequestHost(HttpServletRequest request) {
        String forwardedHost = trimHeaderValue(request.getHeader("X-Forwarded-Host"));
        String hostValue = forwardedHost != null ? forwardedHost : trimHeaderValue(request.getHeader("Host"));
        if (hostValue == null || hostValue.isBlank()) {
            return request.getServerName();
        }
        if (hostValue.startsWith("[")) {
            int endIndex = hostValue.indexOf(']');
            if (endIndex > 0) {
                return hostValue.substring(1, endIndex);
            }
        }
        int colonIndex = hostValue.indexOf(':');
        return colonIndex > 0 ? hostValue.substring(0, colonIndex) : hostValue;
    }

    private String trimHeaderValue(String rawValue) {
        if (rawValue == null) {
            return null;
        }
        String normalized = rawValue.trim();
        if (normalized.isBlank()) {
            return null;
        }
        int commaIndex = normalized.indexOf(',');
        return commaIndex > 0 ? normalized.substring(0, commaIndex).trim() : normalized;
    }

    /**
     * 基于当前绑定仓库创建新的 GitLab Tag。
     */
    @PostMapping("/bindings/{id}/tags")
    @RequirePermission("gitlab:manage")
    public ApiResponse<GitlabTagCreateResult> createBindingTag(@PathVariable Long id,
                                                               @Valid @RequestBody GitlabTagCreateRequest request) {
        return ApiResponse.success(gitlabManagementService.createBindingTag(id, request));
    }

    /**
     * 基于当前绑定仓库快速发起 GitLab Merge Request。
     */
    @PostMapping("/bindings/{id}/merge-requests")
    @RequirePermission("gitlab:manage")
    public ApiResponse<GitlabCreateMergeRequestResult> createBindingMergeRequest(@PathVariable Long id,
                                                                                 @Valid @RequestBody GitlabCreateMergeRequestRequest request) {
        return ApiResponse.success(gitlabManagementService.createBindingMergeRequest(id, request));
    }

    @GetMapping("/auto-merge-configs")
    @RequirePermission("gitlab:view")
    public ApiResponse<PageResponse<GitlabAutoMergeConfigSummary>> pageAutoMergeConfigs(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String executionMode,
            @RequestParam(required = false) Boolean enabled
    ) {
        return ApiResponse.success(gitlabManagementService.pageAutoMergeConfigs(page, size, keyword, executionMode, enabled));
    }

    @GetMapping("/auto-merge-logs")
    @RequirePermission("gitlab:view")
    public ApiResponse<PageResponse<GitlabAutoMergeLogSummary>> pageAutoMergeLogs(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) Long configId,
            @RequestParam(required = false) String result,
            @RequestParam(required = false) String triggerType
    ) {
        return ApiResponse.success(gitlabManagementService.pageAutoMergeLogs(page, size, configId, result, triggerType));
    }

    @GetMapping("/projects/{projectId}/auto-merge-share")
    @RequirePermission("gitlab:view")
    public ApiResponse<GitlabAutoMergeProjectShareSummary> getProjectAutoMergeShare(@PathVariable Long projectId) {
        return ApiResponse.success(gitlabManagementService.getProjectAutoMergeShare(projectId));
    }

    @PostMapping("/projects/{projectId}/auto-merge-share")
    @RequirePermission("gitlab:manage")
    public ApiResponse<GitlabAutoMergeProjectShareSummary> createOrRefreshProjectAutoMergeShare(@PathVariable Long projectId,
                                                                                                 @Valid @RequestBody GitlabAutoMergeProjectShareRequest request) {
        return ApiResponse.success(gitlabManagementService.createOrRefreshProjectAutoMergeShare(projectId, request));
    }

    @DeleteMapping("/projects/{projectId}/auto-merge-share")
    @RequirePermission("gitlab:manage")
    public ApiResponse<Void> disableProjectAutoMergeShare(@PathVariable Long projectId) {
        gitlabManagementService.disableProjectAutoMergeShare(projectId);
        return new ApiResponse<>(true, "Deleted successfully", null);
    }

    @GetMapping("/public/projects/{projectId}/auto-merge-logs/{token}")
    public ApiResponse<GitlabAutoMergePublicLogPage> pageProjectAutoMergeLogsByShare(@PathVariable Long projectId,
                                                                                      @PathVariable String token,
                                                                                      @RequestParam(defaultValue = "1") int page,
                                                                                      @RequestParam(defaultValue = "10") int size,
                                                                                      @RequestParam(required = false) String result) {
        return ApiResponse.success(gitlabManagementService.pageProjectAutoMergeLogsByShare(projectId, token, page, size, result));
    }

    /**
     * 公开侧：基于只读分享 token 提交对某条审查问题的逐条反馈。
     *
     * <p>匿名访问，无 @RequirePermission，仅校验分享链接有效性。</p>
     */
    @PostMapping("/public/projects/{projectId}/auto-merge-logs/{token}/{logId}/issue-feedback")
    public ApiResponse<GitlabAutoMergeLogIssueFeedbackSummary> submitIssueFeedback(
            @PathVariable Long projectId,
            @PathVariable String token,
            @PathVariable Long logId,
            @Valid @RequestBody GitlabAutoMergeLogIssueFeedbackRequest request,
            HttpServletRequest httpRequest) {
        String clientIp = httpRequest.getHeader("X-Forwarded-For");
        if (clientIp == null || clientIp.trim().isEmpty()) {
            clientIp = httpRequest.getRemoteAddr();
        }
        String userAgent = httpRequest.getHeader("User-Agent");
        return ApiResponse.success(gitlabManagementService.submitIssueFeedback(
                projectId, token, logId, request, clientIp, userAgent));
    }

    /**
     * 公开侧：基于只读分享 token + 当前指纹，查询某条日志的全部已有反馈（详情打开时回显用）。
     */
    @GetMapping("/public/projects/{projectId}/auto-merge-logs/{token}/{logId}/issue-feedback")
    public ApiResponse<List<GitlabAutoMergeLogIssueFeedbackSummary>> listIssueFeedbackByLog(
            @PathVariable Long projectId,
            @PathVariable String token,
            @PathVariable Long logId,
            @RequestParam String fingerprint) {
        return ApiResponse.success(gitlabManagementService.listIssueFeedbackByLog(
                projectId, token, logId, fingerprint));
    }

    /**
     * 公开侧：基于项目只读分享 token 列出该项目下绑定的所有流水线（Woodpecker + Jenkins 合并）。
     */
    @GetMapping("/public/projects/{projectId}/pipelines/{token}")
    public ApiResponse<List<ProjectPublicPipelineSummary>> listPublicPipelinesByShare(@PathVariable Long projectId,
                                                                                       @PathVariable String token) {
        return ApiResponse.success(gitlabManagementService.listPublicPipelinesByShare(projectId, token));
    }

    /**
     * 公开侧：基于项目只读分享 token 分页查看某条流水线的运行历史摘要，仅暴露 6 个非敏感字段。
     */
    @GetMapping("/public/projects/{projectId}/pipelines/{token}/runs")
    public ApiResponse<ProjectPublicPipelineRunPage> pagePublicPipelineRunsByShare(@PathVariable Long projectId,
                                                                                    @PathVariable String token,
                                                                                    @RequestParam String kind,
                                                                                    @RequestParam Long pipelineId,
                                                                                    @RequestParam(defaultValue = "1") int page,
                                                                                    @RequestParam(defaultValue = "10") int size) {
        return ApiResponse.success(gitlabManagementService.pagePublicPipelineRunsByShare(projectId, token, kind, pipelineId, page, size));
    }

    @PostMapping("/auto-merge-configs")
    @RequirePermission("gitlab:manage")
    public ApiResponse<GitlabAutoMergeConfigSummary> createAutoMergeConfig(@Valid @RequestBody GitlabAutoMergeConfigRequest request) {
        return ApiResponse.success(gitlabManagementService.createAutoMergeConfig(request));
    }

    @PutMapping("/auto-merge-configs/{id}")
    @RequirePermission("gitlab:manage")
    public ApiResponse<GitlabAutoMergeConfigSummary> updateAutoMergeConfig(@PathVariable Long id,
                                                                           @Valid @RequestBody GitlabAutoMergeConfigRequest request) {
        return ApiResponse.success(gitlabManagementService.updateAutoMergeConfig(id, request));
    }

    @DeleteMapping("/auto-merge-configs/{id}")
    @RequirePermission("gitlab:manage")
    public ApiResponse<Void> deleteAutoMergeConfig(@PathVariable Long id) {
        gitlabManagementService.deleteAutoMergeConfig(id);
        return new ApiResponse<>(true, "Deleted successfully", null);
    }

    @PostMapping("/auto-merge-configs/{id}/test")
    @RequirePermission("gitlab:manage")
    public ApiResponse<GitlabAutoMergeConfigSummary> testAutoMergeConfig(@PathVariable Long id) {
        return ApiResponse.success(gitlabManagementService.testAutoMergeConfig(id));
    }

    @GetMapping("/auto-merge-configs/{id}/merge-requests")
    @RequirePermission("gitlab:view")
    public ApiResponse<List<GitlabMergeRequestSummary>> previewAutoMergeMergeRequests(@PathVariable Long id) {
        return ApiResponse.success(gitlabManagementService.previewAutoMergeConfigMergeRequests(id));
    }

    @PostMapping("/auto-merge-configs/{id}/run")
    @RequirePermission("gitlab:manage")
    public ApiResponse<GitlabAutoMergeRunResult> runAutoMerge(@PathVariable Long id) {
        return ApiResponse.success(gitlabManagementService.runAutoMergeConfig(id));
    }

    /**
     * 列出指定自动合并配置下的全部外发 Webhook（URL 已脱敏）。
     */
    @GetMapping("/auto-merge-configs/{id}/webhooks")
    @RequirePermission("gitlab:view")
    public ApiResponse<List<GitlabAutoMergeWebhookSummary>> listAutoMergeWebhooks(@PathVariable Long id) {
        return ApiResponse.success(gitlabManagementService.listAutoMergeWebhooks(id));
    }

    /**
     * 为指定自动合并配置新增一条外发 Webhook。
     */
    @PostMapping("/auto-merge-configs/{id}/webhooks")
    @RequirePermission("gitlab:manage")
    public ApiResponse<GitlabAutoMergeWebhookSummary> createAutoMergeWebhook(@PathVariable Long id,
                                                                             @Valid @RequestBody GitlabAutoMergeWebhookRequest request) {
        return ApiResponse.success(gitlabManagementService.createAutoMergeWebhook(id, request));
    }

    /**
     * 更新指定外发 Webhook。
     */
    @PutMapping("/auto-merge-webhooks/{webhookId}")
    @RequirePermission("gitlab:manage")
    public ApiResponse<GitlabAutoMergeWebhookSummary> updateAutoMergeWebhook(@PathVariable Long webhookId,
                                                                             @Valid @RequestBody GitlabAutoMergeWebhookRequest request) {
        return ApiResponse.success(gitlabManagementService.updateAutoMergeWebhook(webhookId, request));
    }

    /**
     * 删除指定外发 Webhook。
     */
    @DeleteMapping("/auto-merge-webhooks/{webhookId}")
    @RequirePermission("gitlab:manage")
    public ApiResponse<Void> deleteAutoMergeWebhook(@PathVariable Long webhookId) {
        gitlabManagementService.deleteAutoMergeWebhook(webhookId);
        return new ApiResponse<>(true, "Deleted successfully", null);
    }

    /**
     * 用一份固定的演示载荷向指定 Webhook 触发一次同步投递，返回最新一次投递状态。
     */
    @PostMapping("/auto-merge-webhooks/{webhookId}/test")
    @RequirePermission("gitlab:manage")
    public ApiResponse<GitlabAutoMergeWebhookSummary> testAutoMergeWebhook(@PathVariable Long webhookId) {
        return ApiResponse.success(gitlabManagementService.testAutoMergeWebhook(webhookId));
    }
}
