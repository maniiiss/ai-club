package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.ProjectApiDebugRecordSummary;
import com.aiclub.platform.dto.ProjectApiEndpointDetail;
import com.aiclub.platform.dto.ProjectApiEnvironmentSummary;
import com.aiclub.platform.dto.ProjectApiExportDocument;
import com.aiclub.platform.dto.ProjectApiFolderSummary;
import com.aiclub.platform.dto.ProjectApiImportResult;
import com.aiclub.platform.dto.ProjectApiProfileSummary;
import com.aiclub.platform.dto.ProjectApiTreeSummary;
import com.aiclub.platform.dto.request.ProjectApiDebugExecuteRequest;
import com.aiclub.platform.dto.request.ProjectApiEndpointRequest;
import com.aiclub.platform.dto.request.ProjectApiEnvironmentRequest;
import com.aiclub.platform.dto.request.ProjectApiFolderRequest;
import com.aiclub.platform.dto.request.ProjectApiImportRequest;
import com.aiclub.platform.dto.request.ProjectApiProfileRequest;
import com.aiclub.platform.service.ProjectApiManagementService;
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
 * 项目级 API 管理控制器，统一承接文档、编辑、环境与调试能力。
 */
@RestController
@RequestMapping("/api/projects/{projectId}/apis")
public class ProjectApiController {

    private final ProjectApiManagementService projectApiManagementService;

    public ProjectApiController(ProjectApiManagementService projectApiManagementService) {
        this.projectApiManagementService = projectApiManagementService;
    }

    @GetMapping("/profile")
    @RequirePermission("api:view")
    public ApiResponse<ProjectApiProfileSummary> getProfile(@PathVariable Long projectId) {
        return ApiResponse.success(projectApiManagementService.getProfile(projectId));
    }

    @PutMapping("/profile")
    @RequirePermission("api:manage")
    public ApiResponse<ProjectApiProfileSummary> updateProfile(@PathVariable Long projectId,
                                                               @Valid @RequestBody ProjectApiProfileRequest request) {
        return ApiResponse.success(projectApiManagementService.updateProfile(projectId, request));
    }

    @GetMapping("/tree")
    @RequirePermission("api:view")
    public ApiResponse<ProjectApiTreeSummary> getTree(@PathVariable Long projectId) {
        return ApiResponse.success(projectApiManagementService.getTree(projectId));
    }

    @PostMapping("/folders")
    @RequirePermission("api:manage")
    public ApiResponse<ProjectApiFolderSummary> createFolder(@PathVariable Long projectId,
                                                             @Valid @RequestBody ProjectApiFolderRequest request) {
        return ApiResponse.success(projectApiManagementService.createFolder(projectId, request));
    }

    @PutMapping("/folders/{folderId}")
    @RequirePermission("api:manage")
    public ApiResponse<ProjectApiFolderSummary> updateFolder(@PathVariable Long projectId,
                                                             @PathVariable Long folderId,
                                                             @Valid @RequestBody ProjectApiFolderRequest request) {
        return ApiResponse.success(projectApiManagementService.updateFolder(projectId, folderId, request));
    }

    @DeleteMapping("/folders/{folderId}")
    @RequirePermission("api:manage")
    public ApiResponse<Void> deleteFolder(@PathVariable Long projectId, @PathVariable Long folderId) {
        projectApiManagementService.deleteFolder(projectId, folderId);
        return new ApiResponse<>(true, "Deleted successfully", null);
    }

    @GetMapping("/endpoints/{endpointId}")
    @RequirePermission("api:view")
    public ApiResponse<ProjectApiEndpointDetail> getEndpoint(@PathVariable Long projectId, @PathVariable Long endpointId) {
        return ApiResponse.success(projectApiManagementService.getEndpoint(projectId, endpointId));
    }

    @PostMapping("/endpoints")
    @RequirePermission("api:manage")
    public ApiResponse<ProjectApiEndpointDetail> createEndpoint(@PathVariable Long projectId,
                                                                @Valid @RequestBody ProjectApiEndpointRequest request) {
        return ApiResponse.success(projectApiManagementService.createEndpoint(projectId, request));
    }

    @PutMapping("/endpoints/{endpointId}")
    @RequirePermission("api:manage")
    public ApiResponse<ProjectApiEndpointDetail> updateEndpoint(@PathVariable Long projectId,
                                                                @PathVariable Long endpointId,
                                                                @Valid @RequestBody ProjectApiEndpointRequest request) {
        return ApiResponse.success(projectApiManagementService.updateEndpoint(projectId, endpointId, request));
    }

    @DeleteMapping("/endpoints/{endpointId}")
    @RequirePermission("api:manage")
    public ApiResponse<Void> deleteEndpoint(@PathVariable Long projectId, @PathVariable Long endpointId) {
        projectApiManagementService.deleteEndpoint(projectId, endpointId);
        return new ApiResponse<>(true, "Deleted successfully", null);
    }

    @GetMapping("/environments")
    @RequirePermission("api:view")
    public ApiResponse<List<ProjectApiEnvironmentSummary>> listEnvironments(@PathVariable Long projectId) {
        return ApiResponse.success(projectApiManagementService.listEnvironments(projectId));
    }

    @PostMapping("/environments")
    @RequirePermission("api:manage")
    public ApiResponse<ProjectApiEnvironmentSummary> createEnvironment(@PathVariable Long projectId,
                                                                       @Valid @RequestBody ProjectApiEnvironmentRequest request) {
        return ApiResponse.success(projectApiManagementService.createEnvironment(projectId, request));
    }

    @PutMapping("/environments/{environmentId}")
    @RequirePermission("api:manage")
    public ApiResponse<ProjectApiEnvironmentSummary> updateEnvironment(@PathVariable Long projectId,
                                                                       @PathVariable Long environmentId,
                                                                       @Valid @RequestBody ProjectApiEnvironmentRequest request) {
        return ApiResponse.success(projectApiManagementService.updateEnvironment(projectId, environmentId, request));
    }

    @DeleteMapping("/environments/{environmentId}")
    @RequirePermission("api:manage")
    public ApiResponse<Void> deleteEnvironment(@PathVariable Long projectId, @PathVariable Long environmentId) {
        projectApiManagementService.deleteEnvironment(projectId, environmentId);
        return new ApiResponse<>(true, "Deleted successfully", null);
    }

    @PostMapping("/imports/openapi")
    @RequirePermission("api:manage")
    public ApiResponse<ProjectApiImportResult> importOpenApi(@PathVariable Long projectId,
                                                             @Valid @RequestBody ProjectApiImportRequest request) {
        return ApiResponse.success(projectApiManagementService.importOpenApi(projectId, request));
    }

    @GetMapping("/exports/openapi")
    @RequirePermission("api:view")
    public ApiResponse<ProjectApiExportDocument> exportOpenApi(@PathVariable Long projectId,
                                                               @RequestParam(required = false) String format) {
        return ApiResponse.success(projectApiManagementService.exportOpenApi(projectId, format));
    }

    @GetMapping("/debug-records")
    @RequirePermission("api:view")
    public ApiResponse<List<ProjectApiDebugRecordSummary>> listDebugRecords(@PathVariable Long projectId,
                                                                            @RequestParam(required = false) Long endpointId) {
        return ApiResponse.success(projectApiManagementService.listDebugRecords(projectId, endpointId));
    }

    @PostMapping("/endpoints/{endpointId}/debug-executions")
    @RequirePermission("api:manage")
    public ApiResponse<ProjectApiDebugRecordSummary> executeDebug(@PathVariable Long projectId,
                                                                  @PathVariable Long endpointId,
                                                                  @Valid @RequestBody ProjectApiDebugExecuteRequest request) {
        return ApiResponse.success(projectApiManagementService.executeDebug(projectId, endpointId, request));
    }
}
