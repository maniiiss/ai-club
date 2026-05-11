package com.aiclub.platform.dto;

public record GiteeMemberSummary(
        Long id,
        String username,
        String name,
        String email,
        String avatarUrl
) {
}
