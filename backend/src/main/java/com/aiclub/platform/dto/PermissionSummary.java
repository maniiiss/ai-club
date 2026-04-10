package com.aiclub.platform.dto;

public record PermissionSummary(
        Long id,
        String name,
        String code,
        String type,
        String path,
        String component,
        String icon,
        Long parentId,
        Integer sortOrder,
        boolean enabled,
        boolean builtIn,
        String description
) {
}
