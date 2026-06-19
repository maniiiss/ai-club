package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

/**
 * 项目级自动合并日志分享配置请求。
 */
public record GitlabAutoMergeProjectShareRequest(
        @NotNull(message = "分享有效期不能为空")
        Boolean permanent,

        @Min(value = 1, message = "分享有效期最少 1 天")
        @Max(value = 3650, message = "分享有效期不能超过 3650 天")
        Integer expiresInDays
) {
}
