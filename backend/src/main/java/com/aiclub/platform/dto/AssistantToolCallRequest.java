package com.aiclub.platform.dto;

import java.util.Map;

/**
 * Assistant 在 tool calling 过程中发出的单次工具调用请求。
 */
public record AssistantToolCallRequest(
        String toolCallId,
        String toolCode,
        String functionName,
        Map<String, Object> arguments
) {
}
