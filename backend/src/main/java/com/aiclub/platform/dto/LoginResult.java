package com.aiclub.platform.dto;

public record LoginResult(
        String token,
        String expiresAt,
        CurrentUserInfo user
) {
}
