package com.aiclub.platform.dto;

import java.util.List;
import java.util.Map;

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
        Long agentTaskId,
        String agentTaskStatus,
        List<HermesActionSummary> actions,
        Map<String, String> actionStatuses,
        List<HermesSelectionCard> selectionCards,
        String createdAt,
        String updatedAt
) {
    public ChatMessageSummary(Long id,
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
                              String updatedAt) {
        this(id, roomId, role, senderUserId, senderUsername, senderName, senderAvatarUrl, content, status, mentionsHermes,
                attachments, null, "", List.of(), Map.of(), List.of(), createdAt, updatedAt);
    }

    public ChatMessageSummary {
        attachments = attachments == null ? List.of() : List.copyOf(attachments);
        actions = actions == null ? List.of() : List.copyOf(actions);
        actionStatuses = actionStatuses == null ? Map.of() : Map.copyOf(actionStatuses);
        selectionCards = selectionCards == null ? List.of() : List.copyOf(selectionCards);
    }
}
