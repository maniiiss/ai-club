package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.GitlabAutoMergeConfigSummary;
import com.aiclub.platform.dto.GitlabAutoMergeLogSummary;
import com.aiclub.platform.dto.GitlabAutoMergeRunResult;
import com.aiclub.platform.dto.GitlabBranchSummary;
import com.aiclub.platform.dto.GitlabCreateMergeRequestResult;
import com.aiclub.platform.dto.GitlabMergeRequestSummary;
import com.aiclub.platform.dto.GitlabTagCreateResult;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.ProjectGitlabBindingSummary;
import com.aiclub.platform.dto.request.GitlabAutoMergeConfigRequest;
import com.aiclub.platform.dto.request.GitlabCreateMergeRequestRequest;
import com.aiclub.platform.dto.request.GitlabTagCreateRequest;
import com.aiclub.platform.dto.request.ProjectGitlabBindingRequest;
import com.aiclub.platform.service.GitlabManagementService;
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

    public GitlabController(GitlabManagementService gitlabManagementService) {
        this.gitlabManagementService = gitlabManagementService;
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
