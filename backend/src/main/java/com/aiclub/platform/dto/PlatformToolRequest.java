package com.aiclub.platform.dto;

import java.util.Map;

/**
 * 平台工具调用请求。
 */
public record PlatformToolRequest(
        String toolCode,
        String triggerSource,
        String scopeKey,
        Long projectId,
        String bizType,
        Long bizId,
        Map<String, Object> payload
) {
}
