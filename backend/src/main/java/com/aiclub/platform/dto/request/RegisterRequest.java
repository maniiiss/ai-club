package com.aiclub.platform.dto.request;

import com.aiclub.platform.common.UserPosition;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record RegisterRequest(
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
        @Size(max = 100, message = "GitLab username length must be <= 100")
        String gitlabUsername,
        /** 注册时必须选择主定位，用于首次进入公众端工作台。 */
        @NotNull(message = "User position cannot be null")
        UserPosition userPosition,
        @NotBlank(message = "Password cannot be blank")
        @Size(min = 6, max = 100, message = "Password length must be between 6 and 100")
        String password
) {

    /**
     * 兼容历史服务测试和内部调用；HTTP 注册请求仍由 userPosition 的 @NotNull 强制要求显式传入。
     */
    public RegisterRequest(String username,
                           String nickname,
                           String email,
                           String phone,
                           String gitlabUsername,
                           String password) {
        this(username, nickname, email, phone, gitlabUsername, UserPosition.DEVELOPER, password);
    }
}
