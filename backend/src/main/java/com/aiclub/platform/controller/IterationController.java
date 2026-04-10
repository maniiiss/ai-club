package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.IterationBoardSummary;
import com.aiclub.platform.dto.IterationSummary;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.ProjectBurndownSummary;
import com.aiclub.platform.dto.TaskSummary;
import com.aiclub.platform.dto.request.IterationRequest;
import com.aiclub.platform.service.PlatformStoreService;
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

    public IterationController(PlatformStoreService platformStoreService) {
        this.platformStoreService = platformStoreService;
    }

    @GetMapping("/iteration-board")
    @RequirePermission("project:view")
    public ApiResponse<IterationBoardSummary> getIterationBoard(@PathVariable Long projectId) {
        return ApiResponse.success(platformStoreService.getIterationBoard(projectId));
    }

    @GetMapping("/burndown")
    @RequirePermission("project:view")
    public ApiResponse<ProjectBurndownSummary> getProjectBurndown(@PathVariable Long projectId) {
        return ApiResponse.success(platformStoreService.getProjectBurndown(projectId));
    }

    @GetMapping("/iterations")
    @RequirePermission("project:view")
    public ApiResponse<List<IterationSummary>> listIterations(@PathVariable Long projectId) {
        return ApiResponse.success(platformStoreService.listProjectIterations(projectId));
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
