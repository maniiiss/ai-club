package com.aiclub.platform.runtime;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * AgentRuntime 通用工具定义。
 * 业务意图：工具名称、平台编码和参数 Schema 由 backend 统一下发，避免每个 Runtime 自己猜测 Assistant 工具协议。
 */
public record RuntimeToolDefinition(
        String toolCode,
        String name,
        String displayName,
        String description,
        boolean readOnly,
        boolean requiresConfirm,
        JsonNode parameters
) {
    public RuntimeToolDefinition {
        toolCode = toolCode == null ? "" : toolCode.trim();
        name = name == null ? "" : name.trim();
        displayName = displayName == null ? "" : displayName.trim();
        description = description == null ? "" : description.trim();
    }
}
