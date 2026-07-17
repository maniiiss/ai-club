package com.aiclub.platform.dto;

import java.time.LocalDateTime;
import java.util.List;

/** 返回给 GitPilot 用户的个人 MCP 服务脱敏摘要。 */
public record AssistantMcpServerSummary(
        Long id,
        String name,
        String endpointUrl,
        String transport,
        String authType,
        boolean credentialConfigured,
        boolean enabled,
        long configVersion,
        String connectionStatus,
        String connectionMessage,
        String serverName,
        String serverVersion,
        List<AssistantMcpToolSummary> tools,
        LocalDateTime lastTestedAt
) {
    public AssistantMcpServerSummary {
        tools = tools == null ? List.of() : List.copyOf(tools);
    }
}
