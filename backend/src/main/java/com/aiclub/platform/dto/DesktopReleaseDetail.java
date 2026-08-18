package com.aiclub.platform.dto;

import java.time.LocalDateTime;
import java.util.List;

/** 管理端桌面版本详情。 */
public record DesktopReleaseDetail(
        Long id,
        String version,
        String channel,
        String title,
        String releaseNotes,
        String status,
        Long publisherUserId,
        LocalDateTime publishedAt,
        LocalDateTime createdAt,
        List<DesktopReleaseArtifactSummary> artifacts
) {
}
