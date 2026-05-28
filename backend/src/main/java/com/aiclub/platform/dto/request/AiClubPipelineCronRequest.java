package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * AI Club Pipeline cron 配置请求。
 */
public record AiClubPipelineCronRequest(
        @NotBlank(message = "Cron 名称不能为空")
        @Size(max = 120, message = "Cron 名称长度不能超过120")
        String name,
        @Size(max = 100, message = "分支长度不能超过100")
        String branch,
        @NotBlank(message = "Cron 表达式不能为空")
        @Size(max = 100, message = "Cron 表达式长度不能超过100")
        String cronExpression,
        @NotNull(message = "启用状态不能为空")
        Boolean enabled
) {
}
