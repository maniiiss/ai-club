package com.aiclub.platform.dto;

import java.time.LocalDateTime;
import java.util.List;

/** 公众端最新桌面版本元数据。 */
public record DesktopReleaseLatest(
        String version,
        String channel,
        String title,
        String releaseNotes,
        LocalDateTime publishedAt,
        List<DesktopReleaseArtifactSummary> installers
) {
}
