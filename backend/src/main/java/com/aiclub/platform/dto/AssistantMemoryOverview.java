package com.aiclub.platform.dto;

import java.util.List;

/**
 * Assistant 记忆管理页的聚合视图。
 * 同时返回原始会话记忆与整理后的结构化事实，避免用户看不到 consolidation 的真实产出。
 */
public record AssistantMemoryOverview(
        List<AssistantUserMemoryItem> conversationMemories,
        List<AssistantMemoryFactItem> consolidatedFacts
) {
}
