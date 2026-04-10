package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record LoginRequest(
        @NotBlank(message = "Username cannot be blank")
        @Size(max = 50, message = "Username length must be <= 50")
        String username,
        @NotBlank(message = "Password cannot be blank")
        @Size(max = 100, message = "Password length must be <= 100")
        String password
) {
}
