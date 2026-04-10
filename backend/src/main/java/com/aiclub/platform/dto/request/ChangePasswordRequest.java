package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ChangePasswordRequest(
        @NotBlank(message = "Current password cannot be blank")
        @Size(max = 100, message = "Current password length must be <= 100")
        String currentPassword,
        @NotBlank(message = "New password cannot be blank")
        @Size(min = 6, max = 100, message = "New password length must be between 6 and 100")
        String newPassword
) {
}
