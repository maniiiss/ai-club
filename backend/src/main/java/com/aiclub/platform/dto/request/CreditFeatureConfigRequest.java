package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record CreditFeatureConfigRequest(
        @NotBlank(message = "功能编码不能为空")
        @Size(max = 80, message = "功能编码长度不能超过 80")
        String featureCode,
        @NotBlank(message = "功能名称不能为空")
        @Size(max = 120, message = "功能名称长度不能超过 120")
        String featureName,
        @Min(value = 1, message = "每次扣减积分必须大于 0")
        int costAmount,
        @NotNull(message = "启用状态不能为空")
        Boolean enabled
) {
}
