package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record CreditGlobalConfigRequest(
        @Min(value = 0, message = "注册赠送积分不能小于 0")
        int registerGrantAmount,
        @NotNull(message = "注册赠送开关不能为空")
        Boolean registerGrantEnabled
) {
}
