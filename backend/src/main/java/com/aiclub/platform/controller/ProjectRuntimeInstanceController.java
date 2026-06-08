package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.ProjectRuntimeInstanceSummary;
import com.aiclub.platform.dto.request.ProjectRuntimeInstanceRequest;
import com.aiclub.platform.service.ProjectRuntimeInstanceService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/projects/{projectId}/runtime-instances")
public class ProjectRuntimeInstanceController {

    private final ProjectRuntimeInstanceService projectRuntimeInstanceService;

    public ProjectRuntimeInstanceController(ProjectRuntimeInstanceService projectRuntimeInstanceService) {
        this.projectRuntimeInstanceService = projectRuntimeInstanceService;
    }

    @GetMapping
    @RequirePermission("project:view")
    public ApiResponse<List<ProjectRuntimeInstanceSummary>> list(@PathVariable Long projectId) {
        return ApiResponse.success(projectRuntimeInstanceService.listByProject(projectId));
    }

    @PostMapping
    @RequirePermission("cicd:manage")
    public ApiResponse<ProjectRuntimeInstanceSummary> create(@PathVariable Long projectId,
                                                             @Valid @RequestBody ProjectRuntimeInstanceRequest request) {
        return ApiResponse.success(projectRuntimeInstanceService.createManual(projectId, request));
    }

    @PutMapping("/{id}")
    @RequirePermission("cicd:manage")
    public ApiResponse<ProjectRuntimeInstanceSummary> update(@PathVariable Long projectId,
                                                             @PathVariable Long id,
                                                             @Valid @RequestBody ProjectRuntimeInstanceRequest request) {
        return ApiResponse.success(projectRuntimeInstanceService.update(projectId, id, request));
    }

    @DeleteMapping("/{id}")
    @RequirePermission("cicd:manage")
    public ApiResponse<Void> delete(@PathVariable Long projectId, @PathVariable Long id) {
        projectRuntimeInstanceService.delete(projectId, id);
        return new ApiResponse<>(true, "Deleted successfully", null);
    }
}
