package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.GitlabAutoMergeConfigSummary;
import com.aiclub.platform.dto.GitlabAutoMergeLogSummary;
import com.aiclub.platform.dto.GitlabAutoMergeRunResult;
import com.aiclub.platform.dto.GitlabBranchSummary;
import com.aiclub.platform.dto.GitlabCreateMergeRequestResult;
import com.aiclub.platform.dto.GitlabMergeRequestSummary;
import com.aiclub.platform.dto.GitlabProductBranchSummary;
import com.aiclub.platform.dto.GitlabProductBranchSyncLogSummary;
import com.aiclub.platform.dto.GitlabProductBranchSyncRunResult;
import com.aiclub.platform.dto.GitlabTagCreateResult;
import com.aiclub.platform.dto.GitlabUserOauthAuthorizeResult;
import com.aiclub.platform.dto.GitlabUserOauthBindingSummary;
import com.aiclub.platform.dto.ExecutionTaskSummary;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.ProjectGitlabBindingSummary;
import com.aiclub.platform.dto.RepositoryScanRulesetSummary;
import com.aiclub.platform.dto.request.GitlabAutoMergeConfigRequest;
import com.aiclub.platform.dto.request.GitlabCreateProductBranchSyncRequest;
import com.aiclub.platform.dto.request.GitlabBindingScanTaskRequest;
import com.aiclub.platform.dto.request.GitlabCreateMergeRequestRequest;
import com.aiclub.platform.dto.request.GitlabProductBranchRequest;
import com.aiclub.platform.dto.request.GitlabTagCreateRequest;
import com.aiclub.platform.dto.request.GitlabUserOauthAuthorizeRequest;
import com.aiclub.platform.dto.request.GitlabUserOauthCallbackRequest;
import com.aiclub.platform.dto.request.ProjectGitlabBindingRequest;
import com.aiclub.platform.service.GitlabManagementService;
import com.aiclub.platform.service.GitlabUserOauthService;
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

@RestController
@RequestMapping("/api/gitlab")
public class GitlabController {

    private final GitlabManagementService gitlabManagementService;
    private final GitlabUserOauthService gitlabUserOauthService;

    public GitlabController(GitlabManagementService gitlabManagementService,
                            GitlabUserOauthService gitlabUserOauthService) {
        this.gitlabManagementService = gitlabManagementService;
        this.gitlabUserOauthService = gitlabUserOauthService;
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
}
