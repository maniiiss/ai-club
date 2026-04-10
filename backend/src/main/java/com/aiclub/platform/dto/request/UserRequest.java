package com.aiclub.platform.dto.request;

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
        @Size(max = 100, message = "GitLab username length must be <= 100")
        String gitlabUsername,
        @NotNull(message = "Enabled flag cannot be null")
        Boolean enabled,
        List<Long> roleIds,
        @Size(min = 6, max = 100, message = "Password length must be between 6 and 100")
        String password
) {
}
