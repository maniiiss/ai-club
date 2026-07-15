package com.aiclub.platform.dto;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 长对话压缩后仍需保留的稳定上下文。
 * 业务意图：摘要可以变化，但项目 ID、候选对象和待确认问题不能因窗口裁剪而丢失。
 */
public record AssistantConversationContextState(
        String summary,
        Map<String, Object> facts,
        String pendingClarification,
        int estimatedTokens,
        long summaryThroughMessageIndex,
        long version
) {
    public AssistantConversationContextState {
        summary = summary == null ? "" : summary.trim();
        facts = facts == null ? Map.of() : Map.copyOf(new LinkedHashMap<>(facts));
        pendingClarification = pendingClarification == null ? "" : pendingClarification.trim();
        estimatedTokens = Math.max(0, estimatedTokens);
        summaryThroughMessageIndex = Math.max(0, summaryThroughMessageIndex);
        version = Math.max(0, version);
    }

    public static AssistantConversationContextState empty() {
        return new AssistantConversationContextState("", Map.of(), "", 0, 0, 0);
    }
}
