package com.aiclub.platform.dto;

import java.util.List;

/**
 * 聊天室房间摘要。
 */
public record ChatRoomSummary(
        Long id,
        String title,
        String visibilityType,
        Long projectId,
        String projectName,
        Long creatorUserId,
        String creatorName,
        String latestPreview,
        String historySummary,
        boolean archived,
        List<ChatMemberSummary> members,
        String createdAt,
        String updatedAt,
        String lastMessageAt
) {
    public ChatRoomSummary {
        members = members == null ? List.of() : List.copyOf(members);
    }
}
