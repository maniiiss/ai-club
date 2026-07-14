package com.aiclub.platform.dto;

import java.util.List;
import java.util.Map;

/**
 * Assistant 调试模式下返回的内部轨迹摘要。
 * 默认 UI 不展示，只有前端显式开启调试模式时才透出。
 */
public record AssistantDebugInfo(
        String model,
        String loopStatus,
        int loopRounds,
        List<Map<String, Object>> assistantTurns,
        Map<String, Object> groundingBefore,
        Map<String, Object> groundingAfter,
        List<Map<String, Object>> toolExecutions,
        String failureMessage
) {
}
