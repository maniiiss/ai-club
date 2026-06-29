package com.aiclub.platform.dto;

import java.util.List;

/**
 * 聊天室详情，包含房间信息和最近消息。
 */
public record ChatRoomDetail(
        ChatRoomSummary room,
        List<ChatMessageSummary> messages
) {
    public ChatRoomDetail {
        messages = messages == null ? List.of() : List.copyOf(messages);
    }
}
