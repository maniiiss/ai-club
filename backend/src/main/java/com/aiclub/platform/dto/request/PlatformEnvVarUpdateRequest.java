package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 系统级环境变量覆盖配置更新请求。
 * 其中 staticValue / httpHeadersJson 允许留空，用于敏感项保留旧值。
 */
public record PlatformEnvVarUpdateRequest(
        @NotBlank(message = "来源类型不能为空")
        @Size(max = 20, message = "来源类型长度不能超过20")
        String sourceType,
        String staticValue,
        @Size(max = 500, message = "HTTP 地址长度不能超过500")
        String httpUrl,
        String httpHeadersJson
) {
}
