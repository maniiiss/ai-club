package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.GiteeMilestoneSummary;
import com.aiclub.platform.dto.GiteeProjectBindingDiscoveryResult;
import com.aiclub.platform.dto.GiteeTestPlanPushContextSummary;
import com.aiclub.platform.dto.GiteeTestPlanPushResult;
import com.aiclub.platform.dto.GiteeWorkItemSyncLogSummary;
import com.aiclub.platform.dto.GiteeWorkItemSyncResult;
import com.aiclub.platform.dto.IterationGiteeBindingSummary;
import com.aiclub.platform.dto.ProjectGiteeBindingSummary;
import com.aiclub.platform.dto.request.GiteeProjectBindingDiscoveryRequest;
import com.aiclub.platform.dto.request.IterationGiteeBindingRequest;
import com.aiclub.platform.dto.request.ProjectGiteeBindingRequest;
import com.aiclub.platform.service.GiteeBindingService;
import com.aiclub.platform.service.GiteeTestPlanPushService;
import com.aiclub.platform.service.GiteeWorkItemSyncService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/gitee")
public class GiteeController {

    private final GiteeBindingService giteeBindingService;
    private final GiteeWorkItemSyncService giteeWorkItemSyncService;
    private final GiteeTestPlanPushService giteeTestPlanPushService;

    public GiteeController(GiteeBindingService giteeBindingService,
                           GiteeWorkItemSyncService giteeWorkItemSyncService,
                           GiteeTestPlanPushService giteeTestPlanPushService) {
        this.giteeBindingService = giteeBindingService;
        this.giteeWorkItemSyncService = giteeWorkItemSyncService;
        this.giteeTestPlanPushService = giteeTestPlanPushService;
    }

    @GetMapping("/projects/{projectId}/binding")
    @RequirePermission("project:view")
    public ApiResponse<ProjectGiteeBindingSummary> getProjectBinding(@PathVariable Long projectId) {
        return ApiResponse.success(giteeBindingService.getProjectBinding(projectId));
    }

    @PostMapping("/projects/{projectId}/binding/discover")
    @RequirePermission("gitee:binding:manage")
    public ApiResponse<GiteeProjectBindingDiscoveryResult> discoverProjectPrograms(
            @PathVariable Long projectId,
            @Valid @RequestBody GiteeProjectBindingDiscoveryRequest request) {
        return ApiResponse.success(giteeBindingService.discoverPrograms(projectId, request));
    }

    @PostMapping("/projects/{projectId}/binding")
    @RequirePermission("gitee:binding:manage")
    public ApiResponse<ProjectGiteeBindingSummary> createProjectBinding(
            @PathVariable Long projectId,
            @Valid @RequestBody ProjectGiteeBindingRequest request) {
        return ApiResponse.success(giteeBindingService.createProjectBinding(projectId, request));
    }

    @PutMapping("/projects/{projectId}/binding")
    @RequirePermission("gitee:binding:manage")
    public ApiResponse<ProjectGiteeBindingSummary> updateProjectBinding(
            @PathVariable Long projectId,
            @Valid @RequestBody ProjectGiteeBindingRequest request) {
        return ApiResponse.success(giteeBindingService.updateProjectBinding(projectId, request));
    }

    @GetMapping("/projects/{projectId}/milestones")
    @RequirePermission("project:view")
    public ApiResponse<List<GiteeMilestoneSummary>> listProjectMilestones(@PathVariable Long projectId) {
        return ApiResponse.success(giteeBindingService.listProjectMilestones(projectId));
    }

    @GetMapping("/iterations/{iterationId}/binding")
    @RequirePermission("project:view")
    public ApiResponse<IterationGiteeBindingSummary> getIterationBinding(@PathVariable Long iterationId) {
        return ApiResponse.success(giteeBindingService.getIterationBinding(iterationId));
    }

    @PostMapping("/iterations/{iterationId}/binding")
    @RequirePermission("gitee:binding:manage")
    public ApiResponse<IterationGiteeBindingSummary> createIterationBinding(
            @PathVariable Long iterationId,
            @Valid @RequestBody IterationGiteeBindingRequest request) {
        return ApiResponse.success(giteeBindingService.createIterationBinding(iterationId, request));
    }

    @PutMapping("/iterations/{iterationId}/binding")
    @RequirePermission("gitee:binding:manage")
    public ApiResponse<IterationGiteeBindingSummary> updateIterationBinding(
            @PathVariable Long iterationId,
            @Valid @RequestBody IterationGiteeBindingRequest request) {
        return ApiResponse.success(giteeBindingService.updateIterationBinding(iterationId, request));
    }

    @PostMapping("/iterations/{iterationId}/sync-work-items")
    @RequirePermission("gitee:work-item:sync")
    public ApiResponse<GiteeWorkItemSyncResult> syncIterationWorkItems(@PathVariable Long iterationId) {
        return ApiResponse.success(giteeWorkItemSyncService.syncIterationWorkItems(iterationId));
    }

    @GetMapping("/iterations/{iterationId}/sync-work-item-logs")
    @RequirePermission("task:view")
    public ApiResponse<List<GiteeWorkItemSyncLogSummary>> listIterationSyncLogs(@PathVariable Long iterationId) {
        return ApiResponse.success(giteeWorkItemSyncService.listIterationSyncLogs(iterationId));
    }

    @GetMapping("/test-plans/{testPlanId}/push-context")
    @RequirePermission("gitee:test:push")
    public ApiResponse<GiteeTestPlanPushContextSummary> getTestPlanPushContext(@PathVariable Long testPlanId) {
        return ApiResponse.success(giteeTestPlanPushService.getPushContext(testPlanId));
    }

    @PostMapping("/test-plans/{testPlanId}/push")
    @RequirePermission("gitee:test:push")
    public ApiResponse<GiteeTestPlanPushResult> pushTestPlan(@PathVariable Long testPlanId) {
        return ApiResponse.success(giteeTestPlanPushService.pushTestPlan(testPlanId));
    }
}
