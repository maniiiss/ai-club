package com.aiclub.platform.dto;

import java.util.List;

public record UserSummary(
        Long id,
        String username,
        String nickname,
        String email,
        String phone,
        Long gitlabUserId,
        String gitlabUsername,
        String gitlabName,
        Long giteeMemberId,
        String giteeUsername,
        String giteeName,
        boolean enabled,
        boolean builtIn,
        String lastLoginAt,
        List<Long> roleIds,
        List<String> roleCodes,
        List<String> roleNames
) {
}
