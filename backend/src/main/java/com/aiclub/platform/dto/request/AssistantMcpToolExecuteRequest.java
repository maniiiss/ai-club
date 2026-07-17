package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;

import java.util.Map;

/** GitPilot 用户确认后执行外部 MCP 工具的请求。 */
public record AssistantMcpToolExecuteRequest(
        @NotBlank String toolCode,
        @NotBlank String scopeKey,
        @NotBlank String clientConversationId,
        @NotBlank String confirmationToken,
        Map<String, Object> arguments
) {
}
