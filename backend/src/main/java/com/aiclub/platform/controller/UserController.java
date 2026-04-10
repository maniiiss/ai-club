package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.UserOptionSummary;
import com.aiclub.platform.dto.UserSummary;
import com.aiclub.platform.dto.request.ResetPasswordRequest;
import com.aiclub.platform.dto.request.UserRequest;
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
@RequestMapping("/api/users")
public class UserController {

    private final AccessManagementService accessManagementService;

    public UserController(AccessManagementService accessManagementService) {
        this.accessManagementService = accessManagementService;
    }

    @GetMapping
    @RequirePermission("system:user:view")
    public ApiResponse<PageResponse<UserSummary>> list(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) Boolean enabled,
            @RequestParam(required = false) Long roleId
    ) {
        return ApiResponse.success(accessManagementService.pageUsers(page, size, keyword, enabled, roleId));
    }

    @GetMapping("/options")
    public ApiResponse<List<UserOptionSummary>> options() {
        return ApiResponse.success(accessManagementService.listUserOptions());
    }

    @PostMapping
    @RequirePermission("system:user:manage")
    public ApiResponse<UserSummary> create(@Valid @RequestBody UserRequest request) {
        return ApiResponse.success(accessManagementService.createUser(request));
    }

    @PutMapping("/{id}")
    @RequirePermission("system:user:manage")
    public ApiResponse<UserSummary> update(@PathVariable Long id, @Valid @RequestBody UserRequest request) {
        return ApiResponse.success(accessManagementService.updateUser(id, request));
    }

    @DeleteMapping("/{id}")
    @RequirePermission("system:user:manage")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        accessManagementService.deleteUser(id);
        return new ApiResponse<>(true, "Deleted successfully", null);
    }

    @PostMapping("/{id}/reset-password")
    @RequirePermission("system:user:manage")
    public ApiResponse<Void> resetPassword(@PathVariable Long id, @Valid @RequestBody ResetPasswordRequest request) {
        accessManagementService.resetPassword(id, request);
        return new ApiResponse<>(true, "Password reset successfully", null);
    }
}
