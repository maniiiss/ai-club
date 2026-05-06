package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.Size;

public record ProjectApiEnvironmentAuthConfigRequest(
        @Size(max = 2000, message = "Bearer Token 长度不能超过2000")
        String token,
        @Size(max = 200, message = "用户名长度不能超过200")
        String username,
        @Size(max = 200, message = "密码长度不能超过200")
        String password,
        @Size(max = 200, message = "API Key 名称长度不能超过200")
        String apiKeyName,
        @Size(max = 2000, message = "API Key 值长度不能超过2000")
        String apiKeyValue,
        @Size(max = 20, message = "API Key 位置长度不能超过20")
        String apiKeyLocation
) {
}
