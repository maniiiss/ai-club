package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

public record AiModelConfigRequest(
        @NotBlank(message = "模型名称不能为空")
        @Size(max = 120, message = "模型名称长度不能超过120")
        String name,
        /**
         * 模型用途类型，区分对话模型与 Embedding 模型，旧调用未传时默认回退为 CHAT。
         */
        @Size(max = 30, message = "模型类型长度不能超过30")
        String modelType,
        @NotBlank(message = "提供商不能为空")
        @Size(max = 30, message = "提供商长度不能超过30")
        String provider,
        @Size(max = 255, message = "API 地址长度不能超过255")
        String apiBaseUrl,
        @NotBlank(message = "模型标识不能为空")
        @Size(max = 120, message = "模型标识长度不能超过120")
        String modelName,
        /**
         * OpenAI 兼容模型的接口调用模式，允许为特定网关跳过自动探测。
         */
        @Size(max = 40, message = "OpenAI 调用模式长度不能超过40")
        String openaiApiMode,
        @Size(max = 500, message = "API Key 长度不能超过500")
        String apiKey,
        @Size(max = 500, message = "描述长度不能超过500")
        String description,
        Boolean enabled,
        /**
         * 模型上下文窗口长度（token），用于 GitPilot CLI 展示与自动压缩阈值判断；为空时 CLI 回退默认。
         */
        @Positive(message = "上下文长度必须为正数")
        Integer contextLength,
        /**
         * 模型最大输出 token 数；为空时 CLI 回退默认。
         */
        @Positive(message = "最大输出必须为正数")
        Integer maxOutputTokens,
        /**
         * 是否对该模型启用 token 计费（灰度开关），关闭时智能体执行不按 token 扣费。
         */
        Boolean tokenBillingEnabled,
        /**
         * 每千输入 token 积分单价；启用 token 计费时必填。
         */
        @DecimalMin(value = "0", message = "输入 token 单价不能为负")
        BigDecimal inputCreditPer1k,
        /**
         * 每千输出 token 积分单价；启用 token 计费时必填。
         */
        @DecimalMin(value = "0", message = "输出 token 单价不能为负")
        BigDecimal outputCreditPer1k,
        /**
         * 每千缓存命中输入 token 单价（可选）；为空时后端按输入单价 ×0.5 兜底。
         */
        @DecimalMin(value = "0", message = "缓存命中 token 单价不能为负")
        BigDecimal cachedInputCreditPer1k
) {
}
