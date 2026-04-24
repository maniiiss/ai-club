package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record SelfUpgradeWorkItemCompleteRequest(
        @NotBlank(message = "完成状态不能为空")
        @Size(max = 20, message = "完成状态不能超过20个字符")
        String status
) {
}
