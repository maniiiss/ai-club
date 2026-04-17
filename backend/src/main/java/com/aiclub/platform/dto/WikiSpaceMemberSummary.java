package com.aiclub.platform.dto;

/**
 * Wiki 空间成员摘要。
 */
public record WikiSpaceMemberSummary(
        Long userId,
        String username,
        String nickname,
        String avatarUrl,
        String memberRole
) {
}
