package com.aiclub.platform.dto;

/**
 * 服务器单项告警状态摘要。
 */
public record ServerAlertStateItem(
        String alertCode,
        String alertName,
        boolean active,
        Integer lastObservedValue,
        Integer consecutiveBreachCount,
        String lastNotifiedAt,
        String lastTriggeredAt,
        String lastRecoveredAt,
        String lastMessage
) {
}
