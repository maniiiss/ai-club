package com.aiclub.platform.dto;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Assistant 会话的 grounding 状态。
 * 平台使用它记住最近绑定对象、唯一命中对象以及待用户选择的候选卡片。
 */
public record AssistantGroundingState(
        Map<String, AssistantGroundingTarget> boundSlots,
        Map<String, AssistantGroundingTarget> recentResolvedSlots,
        List<AssistantSelectionCard> pendingSelectionCards,
        String resumeQuestion
) {

    public AssistantGroundingState {
        boundSlots = boundSlots == null ? Map.of() : Map.copyOf(new LinkedHashMap<>(boundSlots));
        recentResolvedSlots = recentResolvedSlots == null ? Map.of() : Map.copyOf(new LinkedHashMap<>(recentResolvedSlots));
        pendingSelectionCards = pendingSelectionCards == null ? List.of() : List.copyOf(pendingSelectionCards);
        resumeQuestion = resumeQuestion == null ? "" : resumeQuestion.trim();
    }

    /**
     * 创建一个空的 grounding 状态，便于首次对话直接起步。
     */
    public static AssistantGroundingState empty() {
        return new AssistantGroundingState(Map.of(), Map.of(), List.of(), "");
    }

    /**
     * 读取某个槽位当前绑定的对象。
     */
    public AssistantGroundingTarget boundSlot(String slot) {
        return slot == null ? null : boundSlots.get(slot);
    }

    /**
     * 读取某个槽位最近一次高置信度命中的对象。
     */
    public AssistantGroundingTarget recentResolvedSlot(String slot) {
        return slot == null ? null : recentResolvedSlots.get(slot);
    }

    /**
     * 用新的槽位绑定结果生成一份状态副本。
     */
    public AssistantGroundingState withBoundSlot(String slot, AssistantGroundingTarget target) {
        LinkedHashMap<String, AssistantGroundingTarget> nextBoundSlots = new LinkedHashMap<>(boundSlots);
        if (slot != null && target != null) {
            nextBoundSlots.put(slot, target);
        }
        return new AssistantGroundingState(nextBoundSlots, recentResolvedSlots, pendingSelectionCards, resumeQuestion);
    }

    /**
     * 用新的唯一命中结果生成一份状态副本。
     */
    public AssistantGroundingState withRecentResolvedSlot(String slot, AssistantGroundingTarget target) {
        LinkedHashMap<String, AssistantGroundingTarget> nextRecentResolvedSlots = new LinkedHashMap<>(recentResolvedSlots);
        if (slot != null && target != null) {
            nextRecentResolvedSlots.put(slot, target);
        }
        return new AssistantGroundingState(boundSlots, nextRecentResolvedSlots, pendingSelectionCards, resumeQuestion);
    }

    /**
     * 替换当前待用户选择的候选卡片和待恢复问题。
     */
    public AssistantGroundingState withPendingSelectionCards(List<AssistantSelectionCard> cards, String nextResumeQuestion) {
        return new AssistantGroundingState(boundSlots, recentResolvedSlots, cards, nextResumeQuestion);
    }

    /**
     * 清掉上一次遗留的歧义选择状态。
     */
    public AssistantGroundingState clearPendingSelection() {
        return new AssistantGroundingState(boundSlots, recentResolvedSlots, List.of(), "");
    }
}
