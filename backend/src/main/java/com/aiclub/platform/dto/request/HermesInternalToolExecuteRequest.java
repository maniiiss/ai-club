package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;

import java.util.Map;

/**
 * backend 内部 MCP 工具执行请求。
 * Python MCP bridge 会把 Hermes 传入的工具参数转发到这里。
 */
public record HermesInternalToolExecuteRequest(
        @NotBlank(message = "会话令牌不能为空")
        String sessionToken,
        @NotBlank(message = "工具编码不能为空")
        String toolCode,
        Map<String, Object> arguments
) {
}
