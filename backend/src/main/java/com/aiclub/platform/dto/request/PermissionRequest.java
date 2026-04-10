package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record PermissionRequest(
        @NotBlank(message = "Permission name cannot be blank")
        @Size(max = 100, message = "Permission name length must be <= 100")
        String name,
        @NotBlank(message = "Permission code cannot be blank")
        @Size(max = 100, message = "Permission code length must be <= 100")
        String code,
        @NotBlank(message = "Permission type cannot be blank")
        @Size(max = 20, message = "Permission type length must be <= 20")
        String type,
        @Size(max = 200, message = "Route path length must be <= 200")
        String path,
        @Size(max = 200, message = "Component length must be <= 200")
        String component,
        @Size(max = 50, message = "Icon length must be <= 50")
        String icon,
        Long parentId,
        @NotNull(message = "Sort order cannot be null")
        Integer sortOrder,
        @NotNull(message = "Enabled flag cannot be null")
        Boolean enabled,
        @Size(max = 500, message = "Description length must be <= 500")
        String description
) {
}
