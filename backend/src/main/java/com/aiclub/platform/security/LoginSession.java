package com.aiclub.platform.security;

import com.aiclub.platform.dto.CurrentUserInfo;

import java.util.List;
import java.util.Set;

public record LoginSession(
        Long userId,
        String username,
        String nickname,
        String email,
        String phone,
        String gitlabUsername,
        /* 当前会话缓存的头像地址，避免每次读取都重新查库。 */
        String avatarUrl,
        boolean enabled,
        List<String> roleCodes,
        List<String> roleNames,
        List<String> permissionCodes
) {

    public static LoginSession fromCurrentUserInfo(CurrentUserInfo currentUserInfo) {
        return new LoginSession(
                currentUserInfo.id(),
                currentUserInfo.username(),
                currentUserInfo.nickname(),
                currentUserInfo.email(),
                currentUserInfo.phone(),
                currentUserInfo.gitlabUsername(),
                currentUserInfo.avatarUrl(),
                currentUserInfo.enabled(),
                List.copyOf(currentUserInfo.roleCodes()),
                List.copyOf(currentUserInfo.roleNames()),
                List.copyOf(currentUserInfo.permissionCodes())
        );
    }

    public CurrentUserInfo toCurrentUserInfo() {
        return new CurrentUserInfo(
                userId,
                username,
                nickname,
                email,
                phone,
                gitlabUsername,
                avatarUrl,
                enabled,
                List.copyOf(roleCodes),
                List.copyOf(roleNames),
                List.copyOf(permissionCodes)
        );
    }

    public AuthContext toAuthContext(String token) {
        return new AuthContext(
                userId,
                username,
                nickname,
                Set.copyOf(roleCodes),
                Set.copyOf(permissionCodes),
                token
        );
    }
}
