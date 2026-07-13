package com.aiclub.platform.dto;

import com.aiclub.platform.constants.ThemeCatalog;

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
        List<String> guideCompleted,
        /** 用户账号级主题 ID，公众端与管理端共用。 */
        String themeId
) {

    public CurrentUserInfo {
        themeId = themeId == null || themeId.isBlank() ? ThemeCatalog.DEFAULT_THEME_ID : themeId;
    }

    /** 兼容历史内部构造调用，未提供主题时统一使用默认深海蓝。 */
    public CurrentUserInfo(Long id,
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
        this(id, username, nickname, email, phone, gitlabUsername, avatarUrl, enabled,
                roleCodes, roleNames, permissionCodes, guideCompleted, ThemeCatalog.DEFAULT_THEME_ID);
    }
}
