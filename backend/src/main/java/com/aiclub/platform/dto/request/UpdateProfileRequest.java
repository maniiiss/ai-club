package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UpdateProfileRequest(
        @NotBlank(message = "Nickname cannot be blank")
        @Size(max = 100, message = "Nickname length must be <= 100")
        String nickname,
        @Size(max = 100, message = "Email length must be <= 100")
        String email,
        @Size(max = 30, message = "Phone length must be <= 30")
        String phone,
        @Size(max = 100, message = "GitLab username length must be <= 100")
        String gitlabUsername,
        @Size(max = 500, message = "Avatar URL length must be <= 500")
        String avatarUrl
) {
}
