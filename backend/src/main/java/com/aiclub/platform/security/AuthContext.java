package com.aiclub.platform.security;

import java.util.Set;

public record AuthContext(
        Long userId,
        String username,
        String nickname,
        Set<String> roleCodes,
        Set<String> permissionCodes,
        String token
) {

    public AuthContext(Long userId,
                       String username,
                       String nickname,
                       Set<String> roleCodes,
                       Set<String> permissionCodes) {
        this(userId, username, nickname, roleCodes, permissionCodes, null);
    }

    public boolean hasPermission(String permission) {
        return permissionCodes.contains(permission);
    }
}
