package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;

/** 管理端更新平台模型 1x 基准输入/输出 token 单价的请求。 */
public record ModelPricingBaseRequest(
        @NotNull(message = "1x 基准输入单价不能为空")
        @DecimalMin(value = "0", message = "1x 基准输入单价不能为负")
        BigDecimal inputCreditPer1k,
        @NotNull(message = "1x 基准输出单价不能为空")
        @DecimalMin(value = "0", message = "1x 基准输出单价不能为负")
        BigDecimal outputCreditPer1k
) {
}
