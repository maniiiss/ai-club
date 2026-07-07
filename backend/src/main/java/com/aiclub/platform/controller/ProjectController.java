package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.ProjectListStatsSummary;
import com.aiclub.platform.dto.ProjectSummary;
import com.aiclub.platform.dto.request.ProjectRequest;
import com.aiclub.platform.dto.request.ReplaceProjectMembersRequest;
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
@RequestMapping("/api/projects")
public class ProjectController {

    private final PlatformStoreService platformStoreService;

    public ProjectController(PlatformStoreService platformStoreService) {
        this.platformStoreService = platformStoreService;
    }

    @GetMapping
    @RequirePermission("project:view")
    public ApiResponse<PageResponse<ProjectSummary>> list(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String status
    ) {
        return ApiResponse.success(platformStoreService.pageProjects(page, size, keyword, status));
    }

    @GetMapping("/stats")
    @RequirePermission("project:view")
    public ApiResponse<ProjectListStatsSummary> stats(@RequestParam(required = false) String keyword,
                                                      @RequestParam(required = false) String status) {
        return ApiResponse.success(platformStoreService.getProjectListStats(keyword, status));
    }

    @GetMapping("/options")
    public ApiResponse<List<ProjectSummary>> options() {
        return ApiResponse.success(platformStoreService.listAllProjects());
    }

    @GetMapping("/{id}")
    @RequirePermission("project:view")
    public ApiResponse<ProjectSummary> detail(@PathVariable Long id) {
        return ApiResponse.success(platformStoreService.getProject(id));
    }

    @PostMapping
    @RequirePermission("project:manage")
    public ApiResponse<ProjectSummary> create(@Valid @RequestBody ProjectRequest request) {
        return ApiResponse.success(platformStoreService.createProject(request));
    }

    @PutMapping("/{id}")
    @RequirePermission("project:manage")
    public ApiResponse<ProjectSummary> update(@PathVariable Long id, @Valid @RequestBody ProjectRequest request) {
        return ApiResponse.success(platformStoreService.updateProject(id, request));
    }

    @PutMapping("/{id}/members")
    public ApiResponse<ProjectSummary> replaceMembers(@PathVariable Long id,
                                                      @RequestBody ReplaceProjectMembersRequest request) {
        return ApiResponse.success(platformStoreService.replaceProjectMembers(id, request.memberUserIds()));
    }

    @DeleteMapping("/{id}")
    @RequirePermission("project:manage")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        platformStoreService.deleteProject(id);
        return new ApiResponse<>(true, "Deleted successfully", null);
    }
}
