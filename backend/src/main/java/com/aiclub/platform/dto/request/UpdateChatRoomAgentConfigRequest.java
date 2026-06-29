package com.aiclub.platform.dto.request;

import java.util.List;

/**
 * 更新聊天室 Agent 配置请求。
 */
public record UpdateChatRoomAgentConfigRequest(
        Boolean enabled,
        String displayName,
        String systemInstruction,
        Boolean proactiveSummaryEnabled,
        Boolean keywordWatchEnabled,
        Boolean taskStatusCallbackEnabled,
        Integer proactiveSummaryMessageThreshold,
        Integer proactiveSummaryMinIntervalMinutes,
        List<String> keywordWatchTerms,
        Integer keywordWatchCooldownMinutes,
        List<String> taskStatusCallbackStatuses
) {
}
