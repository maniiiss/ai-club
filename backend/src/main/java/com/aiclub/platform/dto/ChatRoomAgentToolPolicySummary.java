package com.aiclub.platform.dto;

/**
 * 聊天室 Agent 单个工具授权策略摘要。
 */
public record ChatRoomAgentToolPolicySummary(
        String toolCode,
        String toolName,
        String moduleCode,
        boolean readOnly,
        String riskLevel,
        boolean enabled,
        boolean autoExecute,
        boolean autoExecuteAllowed,
        String permissionCode,
        String updatedAt
) {
}
