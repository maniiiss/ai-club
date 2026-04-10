package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.PermissionSummary;
import com.aiclub.platform.dto.request.PermissionRequest;
import com.aiclub.platform.service.AccessManagementService;
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
@RequestMapping("/api/permissions")
public class PermissionController {

    private final AccessManagementService accessManagementService;

    public PermissionController(AccessManagementService accessManagementService) {
        this.accessManagementService = accessManagementService;
    }

    @GetMapping
    @RequirePermission("system:permission:view")
    public ApiResponse<PageResponse<PermissionSummary>> list(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) Boolean enabled
    ) {
        return ApiResponse.success(accessManagementService.pagePermissions(page, size, keyword, type, enabled));
    }

    @GetMapping("/options")
    public ApiResponse<List<PermissionSummary>> options() {
        return ApiResponse.success(accessManagementService.listPermissionOptions());
    }

    @PostMapping
    @RequirePermission("system:permission:manage")
    public ApiResponse<PermissionSummary> create(@Valid @RequestBody PermissionRequest request) {
        return ApiResponse.success(accessManagementService.createPermission(request));
    }

    @PutMapping("/{id}")
    @RequirePermission("system:permission:manage")
    public ApiResponse<PermissionSummary> update(@PathVariable Long id, @Valid @RequestBody PermissionRequest request) {
        return ApiResponse.success(accessManagementService.updatePermission(id, request));
    }

    @DeleteMapping("/{id}")
    @RequirePermission("system:permission:manage")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        accessManagementService.deletePermission(id);
        return new ApiResponse<>(true, "Deleted successfully", null);
    }
}
