package com.aiclub.platform.dto;

import java.util.Map;

/**
 * Assistant 返回给前端的动作卡片。
 * 第一版主要用于发起执行中心任务。
 */
public record AssistantActionSummary(
        String type,
        String title,
        String description,
        boolean requiresConfirm,
        Map<String, Object> params
) {
}
