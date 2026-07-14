package com.aiclub.platform.dto;

import java.util.List;
import java.util.Map;

/**
 * 聊天室 Agent 单次 Assistant 运行结果。
 * 业务意图：让持久化任务调度器能读取 Assistant 原生 tool calling 写入的动作、候选和执行轨迹，并同步到聊天室事件流。
 */
public record AssistantChatRoomAgentTaskResult(
        String content,
        List<AssistantActionSummary> actions,
        List<AssistantSelectionCard> selectionCards,
        List<Map<String, Object>> toolExecutions
) {
    public AssistantChatRoomAgentTaskResult {
        content = content == null ? "" : content.trim();
        actions = actions == null ? List.of() : List.copyOf(actions);
        selectionCards = selectionCards == null ? List.of() : List.copyOf(selectionCards);
        toolExecutions = toolExecutions == null ? List.of() : List.copyOf(toolExecutions);
    }

    public static AssistantChatRoomAgentTaskResult empty(String content) {
        return new AssistantChatRoomAgentTaskResult(content, List.of(), List.of(), List.of());
    }
}
