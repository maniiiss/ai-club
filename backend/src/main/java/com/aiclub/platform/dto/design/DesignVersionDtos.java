package com.aiclub.platform.dto.design;

import com.fasterxml.jackson.databind.JsonNode;

import java.time.LocalDateTime;
import java.util.List;

/** GitPilot Design 上传与项目页面共用的 API 契约。 */
public final class DesignVersionDtos {
    private DesignVersionDtos() { }

    public record CreateDesignVersionRequest(
            String designId,
            String revisionId,
            String name,
            String summary,
            JsonNode snapshot,
            String previewHtml
    ) { }

    public record DesignVersionSummary(
            Long id,
            Long projectId,
            String designId,
            String revisionId,
            Integer versionNumber,
            String title,
            String summary,
            String status,
            int fileCount,
            long snapshotBytes,
            Long creatorUserId,
            LocalDateTime createdAt
    ) { }

    public record DesignVersionDetail(
            Long id,
            Long projectId,
            String designId,
            String revisionId,
            Integer versionNumber,
            String title,
            String summary,
            String status,
            JsonNode snapshot,
            String previewHtml,
            Long creatorUserId,
            LocalDateTime createdAt
    ) { }

    public record DesignVersionList(List<DesignVersionSummary> versions) { }
}
