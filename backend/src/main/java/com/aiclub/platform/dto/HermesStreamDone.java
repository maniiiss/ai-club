package com.aiclub.platform.dto;

import java.util.List;

/**
 * 流式回答完成后的终态事件。
 */
public record HermesStreamDone(
        String scopeKey,
        String roleName,
        String content,
        List<HermesReferenceSummary> references,
        List<String> suggestions,
        List<HermesActionSummary> actions,
        List<HermesSelectionCard> selectionCards,
        HermesDebugInfo debug
) {
}
