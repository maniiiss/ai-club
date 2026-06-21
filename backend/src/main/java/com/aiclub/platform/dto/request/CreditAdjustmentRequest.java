package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreditAdjustmentRequest(
        int amount,
        @NotBlank(message = "调账原因不能为空")
        @Size(max = 500, message = "调账原因长度不能超过 500")
        String reason
) {
}
