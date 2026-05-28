package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotNull;

/**
 * 公开触发 webhook 配置请求。
 */
public record AiClubPipelineTriggerWebhookRequest(
        @NotNull(message = "启用状态不能为空")
        Boolean enabled,
        @NotNull(message = "是否重新生成 token 不能为空")
        Boolean regenerateToken
) {
}
