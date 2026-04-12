package com.aiclub.platform.dto;

import java.util.Map;

/**
 * 工具执行后建议用户确认的动作。
 */
public record PlatformToolAction(
        String type,
        String title,
        String description,
        boolean requiresConfirm,
        Map<String, Object> params
) {
}
