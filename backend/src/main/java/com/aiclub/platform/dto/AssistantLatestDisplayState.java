package com.aiclub.platform.dto;

import java.util.List;

/**
 * Assistant 会话详情页需要回显的最新展示态快照。
 */
public record AssistantLatestDisplayState(
        List<AssistantReferenceSummary> references,
        List<String> suggestions,
        List<AssistantActionSummary> actions,
        List<AssistantSelectionCard> selectionCards,
        AssistantDebugInfo debug
) {
    public AssistantLatestDisplayState {
        references = references == null ? List.of() : List.copyOf(references);
        suggestions = suggestions == null ? List.of() : List.copyOf(suggestions);
        actions = actions == null ? List.of() : List.copyOf(actions);
        selectionCards = selectionCards == null ? List.of() : List.copyOf(selectionCards);
    }

    /**
     * 返回一个空的展示态快照，供新会话或历史数据缺省时复用。
     */
    public static AssistantLatestDisplayState empty() {
        return new AssistantLatestDisplayState(List.of(), List.of(), List.of(), List.of(), null);
    }
}
