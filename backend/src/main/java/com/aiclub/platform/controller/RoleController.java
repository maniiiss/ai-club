package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.RoleSummary;
import com.aiclub.platform.dto.request.RoleRequest;
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
@RequestMapping("/api/roles")
public class RoleController {

    private final AccessManagementService accessManagementService;

    public RoleController(AccessManagementService accessManagementService) {
        this.accessManagementService = accessManagementService;
    }

    @GetMapping
    @RequirePermission("system:role:view")
    public ApiResponse<PageResponse<RoleSummary>> list(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) Boolean enabled
    ) {
        return ApiResponse.success(accessManagementService.pageRoles(page, size, keyword, enabled));
    }

    @GetMapping("/options")
    public ApiResponse<List<RoleSummary>> options() {
        return ApiResponse.success(accessManagementService.listRoleOptions());
    }

    @PostMapping
    @RequirePermission("system:role:manage")
    public ApiResponse<RoleSummary> create(@Valid @RequestBody RoleRequest request) {
        return ApiResponse.success(accessManagementService.createRole(request));
    }

    @PutMapping("/{id}")
    @RequirePermission("system:role:manage")
    public ApiResponse<RoleSummary> update(@PathVariable Long id, @Valid @RequestBody RoleRequest request) {
        return ApiResponse.success(accessManagementService.updateRole(id, request));
    }

    @DeleteMapping("/{id}")
    @RequirePermission("system:role:manage")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        accessManagementService.deleteRole(id);
        return new ApiResponse<>(true, "Deleted successfully", null);
    }
}
