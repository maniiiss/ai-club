package com.aiclub.platform.dto;

public record NotificationItem(
        Long id,
        String type,
        String level,
        String title,
        String content,
        String bizType,
        Long bizId,
        String actionUrl,
        boolean read,
        String senderName,
        String createdAt,
        String readAt
) {
}
