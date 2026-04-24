package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record SelfUpgradeWorkItemUpdateRequest(
        @NotBlank(message = "标题不能为空")
        @Size(max = 255, message = "标题不能超过255个字符")
        String title,
        String description,
        @NotBlank(message = "优先级不能为空")
        @Size(max = 20, message = "优先级不能超过20个字符")
        String priority,
        @NotBlank(message = "状态不能为空")
        @Size(max = 20, message = "状态不能超过20个字符")
        String status,
        Long assigneeUserId,
        String repositoryBindingsJson,
        String executionPrompt
) {
}
