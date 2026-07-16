package com.aiclub.platform.dto.request;

import com.aiclub.platform.common.UserPosition;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

public record UserRequest(
        @NotBlank(message = "Username cannot be blank")
        @Size(max = 50, message = "Username length must be <= 50")
        String username,
        @NotBlank(message = "Nickname cannot be blank")
        @Size(max = 100, message = "Nickname length must be <= 100")
        String nickname,
        @Size(max = 100, message = "Email length must be <= 100")
        String email,
        @Size(max = 30, message = "Phone length must be <= 30")
        String phone,
        Long gitlabUserId,
        @Size(max = 100, message = "GitLab username length must be <= 100")
        String gitlabUsername,
        @Size(max = 100, message = "GitLab name length must be <= 100")
        String gitlabName,
        Long giteeMemberId,
        @Size(max = 100, message = "Gitee username length must be <= 100")
        String giteeUsername,
        @Size(max = 100, message = "Gitee name length must be <= 100")
        String giteeName,
        @NotNull(message = "Enabled flag cannot be null")
        Boolean enabled,
        List<Long> roleIds,
        /** 管理端可保留为空，以兼容尚未补齐定位的存量账号。 */
        UserPosition userPosition,
        @Size(min = 6, max = 100, message = "Password length must be between 6 and 100")
        String password
) {

    /** 兼容旧版完整用户管理载荷；新增定位前的调用统一保留为未设置。 */
    public UserRequest(String username,
                       String nickname,
                       String email,
                       String phone,
                       Long gitlabUserId,
                       String gitlabUsername,
                       String gitlabName,
                       Long giteeMemberId,
                       String giteeUsername,
                       String giteeName,
                       Boolean enabled,
                       List<Long> roleIds,
                       String password) {
        this(username, nickname, email, phone, gitlabUserId, gitlabUsername, gitlabName,
                giteeMemberId, giteeUsername, giteeName, enabled, roleIds, null, password);
    }

    public UserRequest(String username,
                       String nickname,
                       String email,
                       String phone,
                       String gitlabUsername,
                       Long giteeMemberId,
                       String giteeUsername,
                       String giteeName,
                       Boolean enabled,
                       List<Long> roleIds,
                       String password) {
        this(
                username,
                nickname,
                email,
                phone,
                null,
                gitlabUsername,
                "",
                giteeMemberId,
                giteeUsername,
                giteeName,
                enabled,
                roleIds,
                null,
                password
        );
    }
}
