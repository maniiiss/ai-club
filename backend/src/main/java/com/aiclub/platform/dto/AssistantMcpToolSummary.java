package com.aiclub.platform.dto;

import com.fasterxml.jackson.databind.JsonNode;

/** 外部 MCP 工具摘要；只返回模型调用所需的非敏感定义。 */
public record AssistantMcpToolSummary(
        String toolCode,
        String name,
        String description,
        boolean readOnly,
        boolean requiresConfirm,
        JsonNode inputSchema,
        /** 用户配置的工具启用状态；发现新工具时默认启用。 */
        Boolean enabled
) {
    /** 兼容历史构造方式，未指定启用状态时默认启用工具。 */
    public AssistantMcpToolSummary(String toolCode,
                                   String name,
                                   String description,
                                   boolean readOnly,
                                   boolean requiresConfirm,
                                   JsonNode inputSchema) {
        this(toolCode, name, description, readOnly, requiresConfirm, inputSchema, true);
    }

    public AssistantMcpToolSummary {
        toolCode = toolCode == null ? "" : toolCode.trim();
        name = name == null ? "" : name.trim();
        description = description == null ? "" : description.trim();
        inputSchema = inputSchema == null ? com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.objectNode() : inputSchema;
        // 历史配置没有 enabled 字段，按旧行为兼容为启用，避免升级后工具目录全部消失。
        enabled = enabled == null || enabled;
    }
}
