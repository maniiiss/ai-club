package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record AgentTestRequest(
        @NotBlank(message = "????????")
        @Size(max = 20000, message = "??????????20000")
        String input
) {
}
