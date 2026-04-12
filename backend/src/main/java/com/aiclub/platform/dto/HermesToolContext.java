package com.aiclub.platform.dto;

import java.util.List;

/**
 * Hermes 工具编排上下文。
 */
public record HermesToolContext(
        List<PlatformToolResult> toolResults,
        List<HermesSelectionCard> selectionCards,
        List<HermesActionSummary> actions,
        HermesGroundingState groundingState,
        HermesDebugInfo debugInfo,
        String failureMessage,
        String contextMarkdown
) {
}
