package com.aiclub.platform.dto;

import java.util.List;
import java.util.Map;

/**
 * 平台执行一次 Hermes 工具调用后的结果。
 * 读工具会回传 tool message，写工具或歧义选择会中断当前 loop 并转为本地结果。
 */
public record HermesToolExecutionOutcome(
        HermesGroundingState groundingState,
        List<PlatformToolResult> toolResults,
        List<HermesSelectionCard> selectionCards,
        List<HermesActionSummary> actions,
        String toolMessageContent,
        boolean stopLoop,
        String stopReason,
        String localSummary,
        Map<String, Object> debugExecution
) {
}
