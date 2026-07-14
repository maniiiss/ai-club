package com.aiclub.platform.dto;

import java.util.List;

/**
 * Assistant 工具编排上下文。
 */
public record AssistantToolContext(
        List<PlatformToolResult> toolResults,
        List<AssistantSelectionCard> selectionCards,
        List<AssistantActionSummary> actions,
        AssistantGroundingState groundingState,
        AssistantDebugInfo debugInfo,
        String failureMessage,
        String contextMarkdown
) {
}
