package com.aiclub.platform.dto;

import java.util.List;
import java.util.Map;

/**
 * 聊天室 Agent 单次 Hermes 运行结果。
 * 业务意图：让持久化任务调度器能读取 Hermes 原生 tool calling 写入的动作、候选和执行轨迹，并同步到聊天室事件流。
 */
public record HermesChatRoomAgentTaskResult(
        String content,
        List<HermesActionSummary> actions,
        List<HermesSelectionCard> selectionCards,
        List<Map<String, Object>> toolExecutions
) {
    public HermesChatRoomAgentTaskResult {
        content = content == null ? "" : content.trim();
        actions = actions == null ? List.of() : List.copyOf(actions);
        selectionCards = selectionCards == null ? List.of() : List.copyOf(selectionCards);
        toolExecutions = toolExecutions == null ? List.of() : List.copyOf(toolExecutions);
    }

    public static HermesChatRoomAgentTaskResult empty(String content) {
        return new HermesChatRoomAgentTaskResult(content, List.of(), List.of(), List.of());
    }
}
