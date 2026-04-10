package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ResetPasswordRequest(
        @NotBlank(message = "New password cannot be blank")
        @Size(min = 6, max = 100, message = "Password length must be between 6 and 100")
        String password
) {
}
