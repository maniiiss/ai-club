package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * GitLab 自动合并外发 Webhook 创建/更新请求。
 * 不在请求里携带配置 id，配置归属由路径参数决定。
 */
public record GitlabAutoMergeWebhookRequest(
        @NotBlank(message = "Webhook 名称不能为空")
        @Size(max = 120, message = "Webhook 名称不能超过120个字符")
        String name,
        @NotBlank(message = "Webhook 地址不能为空")
        @Size(max = 1000, message = "Webhook 地址不能超过1000个字符")
        @Pattern(regexp = "^https?://.+", message = "Webhook 地址必须以 http:// 或 https:// 开头")
        String targetUrl,
        @NotEmpty(message = "至少订阅一个事件")
        List<@NotBlank(message = "订阅事件不能为空字符串") @Size(max = 30) String> subscribedEvents,
        @Size(max = 4000, message = "消息模板不能超过4000个字符")
        String messageTemplate,
        Boolean enabled
) {
}
