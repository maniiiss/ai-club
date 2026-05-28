package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * 外部回调 webhook 配置请求。
 */
public record AiClubPipelineCallbackWebhookRequest(
        @NotNull(message = "启用状态不能为空")
        Boolean enabled,
        @Size(max = 2000, message = "回调地址长度不能超过2000")
        String callbackUrl,
        @NotNull(message = "订阅状态不能为空")
        List<String> subscribedStatuses
) {
}
