package com.aiclub.platform.dto;

import java.util.List;

public record CurrentUserInfo(
        Long id,
        String username,
        String nickname,
        String email,
        String phone,
        String gitlabUsername,
        /* 用户头像访问地址，为空时前端回退显示昵称首字。 */
        String avatarUrl,
        boolean enabled,
        List<String> roleCodes,
        List<String> roleNames,
        List<String> permissionCodes,
        /** 用户已完成新手引导的页面 key 列表。 */
        List<String> guideCompleted
) {
}
