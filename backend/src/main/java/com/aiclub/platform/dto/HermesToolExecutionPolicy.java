package com.aiclub.platform.dto;

import java.util.List;

/**
 * Hermes 工具执行策略快照。
 * 业务意图：把聊天室 Agent 的房间授权固化到本轮 MCP 会话态中，供内部 tool calling 恢复时参与写工具决策。
 */
public record HermesToolExecutionPolicy(
        Long taskId,
        Long roomId,
        Long assistantMessageId,
        Long authorizedByUserId,
        List<String> enabledToolCodes,
        List<String> autoExecutableToolCodes
) {
    public HermesToolExecutionPolicy {
        enabledToolCodes = enabledToolCodes == null ? List.of() : List.copyOf(enabledToolCodes);
        autoExecutableToolCodes = autoExecutableToolCodes == null ? List.of() : List.copyOf(autoExecutableToolCodes);
    }

    public static HermesToolExecutionPolicy empty() {
        return new HermesToolExecutionPolicy(null, null, null, null, List.of(), List.of());
    }

    public boolean hasChatRoomAgentTask() {
        return taskId != null && roomId != null;
    }

    public boolean isToolEnabled(String toolCode) {
        return enabledToolCodes.contains(toolCode);
    }

    public boolean canAutoExecute(String toolCode) {
        return isToolEnabled(toolCode) && autoExecutableToolCodes.contains(toolCode);
    }
}
