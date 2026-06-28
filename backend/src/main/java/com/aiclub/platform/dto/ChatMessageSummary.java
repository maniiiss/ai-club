package com.aiclub.platform.dto;

import java.util.List;

/**
 * 聊天室消息摘要。
 */
public record ChatMessageSummary(
        Long id,
        Long roomId,
        String role,
        Long senderUserId,
        String senderUsername,
        String senderName,
        String senderAvatarUrl,
        String content,
        String status,
        boolean mentionsHermes,
        List<ChatAttachmentSummary> attachments,
        String createdAt,
        String updatedAt
) {
    public ChatMessageSummary {
        attachments = attachments == null ? List.of() : List.copyOf(attachments);
    }
}
