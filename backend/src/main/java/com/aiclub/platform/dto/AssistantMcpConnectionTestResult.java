package com.aiclub.platform.dto;

import java.util.List;

/** MCP 连接测试与工具发现结果；不返回服务凭证。 */
public record AssistantMcpConnectionTestResult(
        boolean success,
        String message,
        String serverName,
        String serverVersion,
        List<AssistantMcpToolSummary> tools
) {
    public AssistantMcpConnectionTestResult {
        message = message == null ? "" : message;
        serverName = serverName == null ? "" : serverName;
        serverVersion = serverVersion == null ? "" : serverVersion;
        tools = tools == null ? List.of() : List.copyOf(tools);
    }
}
