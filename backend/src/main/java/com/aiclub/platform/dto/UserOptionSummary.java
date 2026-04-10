package com.aiclub.platform.dto;

public record UserOptionSummary(
        Long id,
        String username,
        String nickname,
        boolean enabled
) {
}
