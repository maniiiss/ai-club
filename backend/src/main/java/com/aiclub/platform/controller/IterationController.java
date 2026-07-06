package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.IterationBoardSummary;
import com.aiclub.platform.dto.IterationSummary;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.ProjectBurndownSummary;
import com.aiclub.platform.dto.ProjectWorkItemStatsSummary;
import com.aiclub.platform.dto.ProjectRequirementModuleOptionSummary;
import com.aiclub.platform.dto.TaskLinksSummary;
import com.aiclub.platform.dto.TaskSummary;
import com.aiclub.platform.dto.request.IterationRequest;
import com.aiclub.platform.service.PlatformStoreService;
import com.aiclub.platform.service.RequirementModuleOptionService;
import com.aiclub.platform.service.WorkItemLinkService;
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
@RequestMapping("/api/projects/{projectId}")
public class IterationController {

    private final PlatformStoreService platformStoreService;
    private final RequirementModuleOptionService requirementModuleOptionService;
    private final WorkItemLinkService workItemLinkService;

    public IterationController(PlatformStoreService platformStoreService,
                               RequirementModuleOptionService requirementModuleOptionService,
                               WorkItemLinkService workItemLinkService) {
        this.platformStoreService = platformStoreService;
        this.requirementModuleOptionService = requirementModuleOptionService;
        this.workItemLinkService = workItemLinkService;
    }

    @GetMapping("/iteration-board")
    @RequirePermission("project:view")
    public ApiResponse<IterationBoardSummary> getIterationBoard(@PathVariable Long projectId) {
        return ApiResponse.success(platformStoreService.getIterationBoard(projectId));
    }

    @GetMapping("/burndown")
    @RequirePermission("project:view")
    public ApiResponse<ProjectBurndownSummary> getProjectBurndown(@PathVariable Long projectId,
                                                                  @RequestParam(required = false) Long iterationId,
                                                                  @RequestParam(required = false, defaultValue = "false") Boolean excludeUnplanned) {
        return ApiResponse.success(platformStoreService.getProjectBurndown(projectId, iterationId, excludeUnplanned));
    }

    @GetMapping("/iterations")
    @RequirePermission("project:view")
    public ApiResponse<List<IterationSummary>> listIterations(@PathVariable Long projectId) {
        return ApiResponse.success(platformStoreService.listProjectIterations(projectId));
    }

    @GetMapping("/requirement-modules")
    @RequirePermission("task:view")
    public ApiResponse<List<ProjectRequirementModuleOptionSummary>> listRequirementModules(@PathVariable Long projectId) {
        return ApiResponse.success(requirementModuleOptionService.listProjectRequirementModules(projectId));
    }

    @GetMapping("/test-cases")
    @RequirePermission("task:view")
    public ApiResponse<PageResponse<TaskLinksSummary.LinkedTestCaseSummary>> pageProjectTestCases(
            @PathVariable Long projectId,
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size
    ) {
        return ApiResponse.success(workItemLinkService.pageProjectTestCases(projectId, keyword, page, size));
    }

    @DeleteMapping("/requirement-modules/{optionId}")
    @RequirePermission("task:manage")
    public ApiResponse<Void> deleteRequirementModule(@PathVariable Long projectId,
                                                     @PathVariable Long optionId) {
        requirementModuleOptionService.deleteProjectRequirementModule(projectId, optionId);
        return new ApiResponse<>(true, "Deleted successfully", null);
    }

    @PostMapping("/iterations")
    @RequirePermission("project:manage")
    public ApiResponse<IterationSummary> createIteration(@PathVariable Long projectId,
                                                         @Valid @RequestBody IterationRequest request) {
        return ApiResponse.success(platformStoreService.createIteration(projectId, request));
    }

    @PutMapping("/iterations/{iterationId}")
    @RequirePermission("project:manage")
    public ApiResponse<IterationSummary> updateIteration(@PathVariable Long projectId,
                                                         @PathVariable Long iterationId,
                                                         @Valid @RequestBody IterationRequest request) {
        return ApiResponse.success(platformStoreService.updateIteration(projectId, iterationId, request));
    }

    @DeleteMapping("/iterations/{iterationId}")
    @RequirePermission("project:manage")
    public ApiResponse<Void> deleteIteration(@PathVariable Long projectId,
                                             @PathVariable Long iterationId) {
        platformStoreService.deleteIteration(projectId, iterationId);
        return new ApiResponse<>(true, "Deleted successfully", null);
    }

    @GetMapping("/work-items")
    @RequirePermission("task:view")
    public ApiResponse<List<TaskSummary>> listWorkItems(@PathVariable Long projectId,
                                                        @RequestParam(required = false) Long iterationId,
                                                        @RequestParam(required = false) Boolean unplanned,
                                                        @RequestParam(required = false) String workItemType,
                                                        @RequestParam(required = false) String keyword) {
        return ApiResponse.success(platformStoreService.listProjectWorkItems(projectId, iterationId, unplanned, workItemType, keyword));
    }

    @GetMapping("/work-items/stats")
    @RequirePermission("task:view")
    public ApiResponse<ProjectWorkItemStatsSummary> getWorkItemStats(@PathVariable Long projectId,
                                                                     @RequestParam(required = false) Long iterationId,
                                                                     @RequestParam(required = false) Boolean unplanned,
                                                                     @RequestParam(required = false) String workItemType,
                                                                     @RequestParam(required = false) String keyword,
                                                                     @RequestParam(required = false) String status,
                                                                     @RequestParam(required = false) String priority,
                                                                     @RequestParam(required = false) Long assigneeUserId) {
        return ApiResponse.success(platformStoreService.getProjectWorkItemStats(
                projectId,
                iterationId,
                unplanned,
                workItemType,
                keyword,
                status,
                priority,
                assigneeUserId
        ));
    }

    @GetMapping("/work-items/page")
    @RequirePermission("task:view")
    public ApiResponse<PageResponse<TaskSummary>> pageWorkItems(@PathVariable Long projectId,
                                                                @RequestParam int page,
                                                                @RequestParam int size,
                                                                @RequestParam(required = false) Long iterationId,
                                                                @RequestParam(required = false) Boolean unplanned,
                                                                @RequestParam(required = false) String workItemType,
                                                                @RequestParam(required = false) String keyword,
                                                                @RequestParam(required = false) String status,
                                                                @RequestParam(required = false) String priority,
                                                                @RequestParam(required = false) Long assigneeUserId) {
        return ApiResponse.success(platformStoreService.pageProjectWorkItems(
                projectId,
                page,
                size,
                iterationId,
                unplanned,
                workItemType,
                keyword,
                status,
                priority,
                assigneeUserId
        ));
    }
}
