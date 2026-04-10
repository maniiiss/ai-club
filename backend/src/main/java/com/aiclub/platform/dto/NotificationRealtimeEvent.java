package com.aiclub.platform.dto;

public record NotificationRealtimeEvent(
        String eventType,
        NotificationItem notification,
        long unreadCount
) {
}
