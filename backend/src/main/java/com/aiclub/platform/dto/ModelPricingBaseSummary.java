package com.aiclub.platform.dto;

import java.math.BigDecimal;

/** 平台模型 1x 基准输入/输出 token 单价，供管理端维护倍率换算基准。 */
public record ModelPricingBaseSummary(
        BigDecimal inputCreditPer1k,
        BigDecimal outputCreditPer1k,
        String updatedAt
) {
}
