package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;

public record TaskRequirementAiRequest(
        @NotBlank(message = "AI 动作不能为空")
        String action,
        Long modelConfigId
) {
}
