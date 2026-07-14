package com.aiclub.platform.dto.request;

import java.util.List;

/**
 * 更新聊天室 Agent 配置请求。
 */
public record UpdateChatRoomAgentConfigRequest(
        Boolean enabled,
        String displayName,
        String runtimeRegistryCode,
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
    /** 兼容旧测试和旧客户端构造方式，未传 Runtime 时默认使用 Legacy。 */
    public UpdateChatRoomAgentConfigRequest(Boolean enabled,
                                            String displayName,
                                            String systemInstruction,
                                            Boolean proactiveSummaryEnabled,
                                            Boolean keywordWatchEnabled,
                                            Boolean taskStatusCallbackEnabled,
                                            Integer proactiveSummaryMessageThreshold,
                                            Integer proactiveSummaryMinIntervalMinutes,
                                            List<String> keywordWatchTerms,
                                            Integer keywordWatchCooldownMinutes,
                                            List<String> taskStatusCallbackStatuses) {
        this(enabled, displayName, "HERMES_LEGACY", systemInstruction, proactiveSummaryEnabled,
                keywordWatchEnabled, taskStatusCallbackEnabled, proactiveSummaryMessageThreshold,
                proactiveSummaryMinIntervalMinutes, keywordWatchTerms, keywordWatchCooldownMinutes,
                taskStatusCallbackStatuses);
    }
}
