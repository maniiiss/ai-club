package com.aiclub.platform.dto;

/**
 * 聊天室成员摘要。
 */
public record ChatMemberSummary(
        Long userId,
        String username,
        String nickname,
        String avatarUrl,
        String role
) {
}
