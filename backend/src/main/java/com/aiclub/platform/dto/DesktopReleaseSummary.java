package com.aiclub.platform.dto;

import java.time.LocalDateTime;

/** 管理端桌面版本列表摘要。 */
public record DesktopReleaseSummary(
        Long id,
        String version,
        String channel,
        String title,
        String status,
        LocalDateTime publishedAt,
        LocalDateTime createdAt,
        int artifactCount
) {
}
