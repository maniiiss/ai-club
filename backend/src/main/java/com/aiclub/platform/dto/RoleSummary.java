package com.aiclub.platform.dto;

import com.aiclub.platform.common.DataPermissionScopeType;

import java.util.List;

public record RoleSummary(
        Long id,
        String name,
        String code,
        boolean enabled,
        boolean builtIn,
        String description,
        DataPermissionScopeType projectVisibilityScope,
        DataPermissionScopeType projectManageScope,
        DataPermissionScopeType iterationDeleteScope,
        DataPermissionScopeType taskDeleteScope,
        List<Long> permissionIds,
        List<String> permissionCodes,
        List<String> permissionNames
) {
}
