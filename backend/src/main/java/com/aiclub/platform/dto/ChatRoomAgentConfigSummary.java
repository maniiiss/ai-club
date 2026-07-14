package com.aiclub.platform.dto;

import java.util.List;

/**
 * 聊天室 Agent 配置摘要。
 */
public record ChatRoomAgentConfigSummary(
        Long roomId,
        boolean enabled,
        String displayName,
        String runtimeRegistryCode,
        String systemInstruction,
        boolean proactiveSummaryEnabled,
        boolean keywordWatchEnabled,
        boolean taskStatusCallbackEnabled,
        int proactiveSummaryMessageThreshold,
        int proactiveSummaryMinIntervalMinutes,
        List<String> keywordWatchTerms,
        int keywordWatchCooldownMinutes,
        List<String> taskStatusCallbackStatuses,
        Long authorizedByUserId,
        String authorizedByName,
        String authorizedAt,
        String updatedAt
) {
    public ChatRoomAgentConfigSummary {
        keywordWatchTerms = keywordWatchTerms == null ? List.of() : List.copyOf(keywordWatchTerms);
        taskStatusCallbackStatuses = taskStatusCallbackStatuses == null ? List.of() : List.copyOf(taskStatusCallbackStatuses);
    }
}
