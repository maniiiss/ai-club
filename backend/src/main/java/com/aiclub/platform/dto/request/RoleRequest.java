package com.aiclub.platform.dto.request;

import com.aiclub.platform.common.DataPermissionScopeType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

public record RoleRequest(
        @NotBlank(message = "Role name cannot be blank")
        @Size(max = 100, message = "Role name length must be <= 100")
        String name,
        @NotBlank(message = "Role code cannot be blank")
        @Size(max = 100, message = "Role code length must be <= 100")
        String code,
        @NotNull(message = "Enabled flag cannot be null")
        Boolean enabled,
        @Size(max = 500, message = "Description length must be <= 500")
        String description,
        @NotNull(message = "Project visibility scope cannot be null")
        DataPermissionScopeType projectVisibilityScope,
        @NotNull(message = "Project manage scope cannot be null")
        DataPermissionScopeType projectManageScope,
        @NotNull(message = "Iteration delete scope cannot be null")
        DataPermissionScopeType iterationDeleteScope,
        @NotNull(message = "Task delete scope cannot be null")
        DataPermissionScopeType taskDeleteScope,
        List<Long> permissionIds
) {
}
