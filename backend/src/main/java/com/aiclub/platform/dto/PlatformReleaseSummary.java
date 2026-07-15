package com.aiclub.platform.dto;

import java.time.LocalDateTime;

/** 管理端版本发布历史摘要。 */
public record PlatformReleaseSummary(
        Long id,
        String version,
        String title,
        Long publisherUserId,
        LocalDateTime publishedAt
) {
}
