package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;

import java.util.Map;

/** Runtime 代理平台工具执行请求；具体用户权限仍由平台会话 Token 再次恢复。 */
public record RuntimeToolExecuteRequest(
        @NotBlank String sessionToken,
        @NotBlank String toolCode,
        Map<String, Object> arguments
) {
}
