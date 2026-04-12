package com.aiclub.platform.dto;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Hermes 会话的 grounding 状态。
 * 平台使用它记住最近绑定对象、唯一命中对象以及待用户选择的候选卡片。
 */
public record HermesGroundingState(
        Map<String, HermesGroundingTarget> boundSlots,
        Map<String, HermesGroundingTarget> recentResolvedSlots,
        List<HermesSelectionCard> pendingSelectionCards,
        String resumeQuestion
) {

    public HermesGroundingState {
        boundSlots = boundSlots == null ? Map.of() : Map.copyOf(new LinkedHashMap<>(boundSlots));
        recentResolvedSlots = recentResolvedSlots == null ? Map.of() : Map.copyOf(new LinkedHashMap<>(recentResolvedSlots));
        pendingSelectionCards = pendingSelectionCards == null ? List.of() : List.copyOf(pendingSelectionCards);
        resumeQuestion = resumeQuestion == null ? "" : resumeQuestion.trim();
    }

    /**
     * 创建一个空的 grounding 状态，便于首次对话直接起步。
     */
    public static HermesGroundingState empty() {
        return new HermesGroundingState(Map.of(), Map.of(), List.of(), "");
    }

    /**
     * 读取某个槽位当前绑定的对象。
     */
    public HermesGroundingTarget boundSlot(String slot) {
        return slot == null ? null : boundSlots.get(slot);
    }

    /**
     * 读取某个槽位最近一次高置信度命中的对象。
     */
    public HermesGroundingTarget recentResolvedSlot(String slot) {
        return slot == null ? null : recentResolvedSlots.get(slot);
    }

    /**
     * 用新的槽位绑定结果生成一份状态副本。
     */
    public HermesGroundingState withBoundSlot(String slot, HermesGroundingTarget target) {
        LinkedHashMap<String, HermesGroundingTarget> nextBoundSlots = new LinkedHashMap<>(boundSlots);
        if (slot != null && target != null) {
            nextBoundSlots.put(slot, target);
        }
        return new HermesGroundingState(nextBoundSlots, recentResolvedSlots, pendingSelectionCards, resumeQuestion);
    }

    /**
     * 用新的唯一命中结果生成一份状态副本。
     */
    public HermesGroundingState withRecentResolvedSlot(String slot, HermesGroundingTarget target) {
        LinkedHashMap<String, HermesGroundingTarget> nextRecentResolvedSlots = new LinkedHashMap<>(recentResolvedSlots);
        if (slot != null && target != null) {
            nextRecentResolvedSlots.put(slot, target);
        }
        return new HermesGroundingState(boundSlots, nextRecentResolvedSlots, pendingSelectionCards, resumeQuestion);
    }

    /**
     * 替换当前待用户选择的候选卡片和待恢复问题。
     */
    public HermesGroundingState withPendingSelectionCards(List<HermesSelectionCard> cards, String nextResumeQuestion) {
        return new HermesGroundingState(boundSlots, recentResolvedSlots, cards, nextResumeQuestion);
    }

    /**
     * 清掉上一次遗留的歧义选择状态。
     */
    public HermesGroundingState clearPendingSelection() {
        return new HermesGroundingState(boundSlots, recentResolvedSlots, List.of(), "");
    }
}
