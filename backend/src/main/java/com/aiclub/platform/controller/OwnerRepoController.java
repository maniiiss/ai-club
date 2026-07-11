package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.OwnerRepoBindingSummary;
import com.aiclub.platform.dto.OwnerRepoPushContextSummary;
import com.aiclub.platform.dto.OwnerRepoPushLogSummary;
import com.aiclub.platform.dto.OwnerRepoPushResult;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.request.OwnerRepoBindingRequest;
import com.aiclub.platform.dto.request.OwnerRepoPushRequest;
import com.aiclub.platform.service.OwnerRepoBindingManagementService;
import com.aiclub.platform.service.OwnerRepoPushService;
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
 * 业主代码仓库推送接口。
 * 归属 GitLab 模块，复用 gitlab:view 查看权限与 gitlab:owner-repo:manage 维护权限。
 */
@RestController
@RequestMapping("/api/gitlab/owner-repos")
public class OwnerRepoController {

    private final OwnerRepoBindingManagementService bindingManagementService;
    private final OwnerRepoPushService ownerRepoPushService;

    public OwnerRepoController(OwnerRepoBindingManagementService bindingManagementService,
                               OwnerRepoPushService ownerRepoPushService) {
        this.bindingManagementService = bindingManagementService;
        this.ownerRepoPushService = ownerRepoPushService;
    }

    /**
     * 分页查询业主仓库绑定。
     */
    @GetMapping("/bindings")
    @RequirePermission("gitlab:view")
    public ApiResponse<PageResponse<OwnerRepoBindingSummary>> pageBindings(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) Long projectId
    ) {
        return ApiResponse.success(bindingManagementService.pageBindings(page, size, keyword, projectId));
    }

    /**
     * 查询指定项目下的全部业主仓库绑定（供公众端推送表单使用）。
     */
    @GetMapping("/bindings/by-project/{projectId}")
    @RequirePermission("gitlab:view")
    public ApiResponse<List<OwnerRepoBindingSummary>> listByProject(@PathVariable Long projectId) {
        return ApiResponse.success(bindingManagementService.listByProject(projectId));
    }

    @PostMapping("/bindings")
    @RequirePermission("gitlab:owner-repo:manage")
    public ApiResponse<OwnerRepoBindingSummary> createBinding(@Valid @RequestBody OwnerRepoBindingRequest request) {
        return ApiResponse.success(bindingManagementService.createBinding(request));
    }

    @PutMapping("/bindings/{id}")
    @RequirePermission("gitlab:owner-repo:manage")
    public ApiResponse<OwnerRepoBindingSummary> updateBinding(@PathVariable Long id,
                                                              @Valid @RequestBody OwnerRepoBindingRequest request) {
        return ApiResponse.success(bindingManagementService.updateBinding(id, request));
    }

    @DeleteMapping("/bindings/{id}")
    @RequirePermission("gitlab:owner-repo:manage")
    public ApiResponse<Void> deleteBinding(@PathVariable Long id) {
        bindingManagementService.deleteBinding(id);
        return new ApiResponse<>(true, "Deleted successfully", null);
    }

    /**
     * 测试业主仓库连通性，回写仓库元信息与测试状态。
     */
    @PostMapping("/bindings/{id}/test")
    @RequirePermission("gitlab:owner-repo:manage")
    public ApiResponse<OwnerRepoBindingSummary> testBinding(@PathVariable Long id) {
        return ApiResponse.success(bindingManagementService.testBinding(id));
    }

    /**
     * 获取推送前置上下文。
     */
    @GetMapping("/bindings/{id}/push-context")
    @RequirePermission("gitlab:view")
    public ApiResponse<OwnerRepoPushContextSummary> getPushContext(@PathVariable Long id) {
        return ApiResponse.success(ownerRepoPushService.getPushContext(id));
    }

    /**
     * 触发推送到业主仓库。
     */
    @PostMapping("/bindings/{id}/push")
    @RequirePermission("gitlab:owner-repo:manage")
    public ApiResponse<OwnerRepoPushResult> pushToOwnerRepo(@PathVariable Long id,
                                                            @Valid @RequestBody OwnerRepoPushRequest request) {
        return ApiResponse.success(ownerRepoPushService.pushToOwnerRepo(id, request));
    }

    /**
     * 分页查询推送历史日志。
     */
    @GetMapping("/bindings/{id}/push-logs")
    @RequirePermission("gitlab:view")
    public ApiResponse<PageResponse<OwnerRepoPushLogSummary>> pagePushLogs(
            @PathVariable Long id,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size
    ) {
        return ApiResponse.success(ownerRepoPushService.pagePushLogs(id, page, size));
    }
}
