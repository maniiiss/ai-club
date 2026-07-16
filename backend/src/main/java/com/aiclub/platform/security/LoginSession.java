package com.aiclub.platform.security;

import com.aiclub.platform.dto.CurrentUserInfo;
import com.aiclub.platform.common.UserPosition;

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
        List<String> permissionCodes,
        List<String> guideCompleted,
        /** 当前会话缓存的账号主题 ID。 */
        String themeId,
        /** 当前会话缓存的用户主定位，供登录响应与首页即时读取。 */
        UserPosition userPosition
) {

    /** 兼容历史 Redis 会话反序列化和旧测试构造。 */
    public LoginSession(Long userId,
                        String username,
                        String nickname,
                        String email,
                        String phone,
                        String gitlabUsername,
                        String avatarUrl,
                        boolean enabled,
                        List<String> roleCodes,
                        List<String> roleNames,
                        List<String> permissionCodes,
                        List<String> guideCompleted) {
        this(userId, username, nickname, email, phone, gitlabUsername, avatarUrl, enabled,
                roleCodes, roleNames, permissionCodes, guideCompleted, null, null);
    }

    /** 兼容已有 Redis 会话数据中已包含主题、但尚未包含用户定位的结构。 */
    public LoginSession(Long userId,
                        String username,
                        String nickname,
                        String email,
                        String phone,
                        String gitlabUsername,
                        String avatarUrl,
                        boolean enabled,
                        List<String> roleCodes,
                        List<String> roleNames,
                        List<String> permissionCodes,
                        List<String> guideCompleted,
                        String themeId) {
        this(userId, username, nickname, email, phone, gitlabUsername, avatarUrl, enabled,
                roleCodes, roleNames, permissionCodes, guideCompleted, themeId, null);
    }

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
                List.copyOf(currentUserInfo.permissionCodes()),
                List.copyOf(currentUserInfo.guideCompleted()),
                currentUserInfo.themeId(),
                currentUserInfo.userPosition()
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
                List.copyOf(permissionCodes),
                List.copyOf(guideCompleted),
                themeId,
                userPosition
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
