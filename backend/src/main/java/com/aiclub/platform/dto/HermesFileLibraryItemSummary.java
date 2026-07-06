package com.aiclub.platform.dto;

import java.util.List;

/**
 * Hermes 个人文件库条目前端摘要。
 */
public record HermesFileLibraryItemSummary(
        Long id,
        Long assetId,
        String fileName,
        String title,
        String description,
        String sourceFormat,
        long fileSize,
        boolean enabled,
        String indexStatus,
        List<String> warnings,
        String lastError,
        String createdAt,
        String updatedAt
) {
    public HermesFileLibraryItemSummary {
        warnings = warnings == null ? List.of() : List.copyOf(warnings);
    }
}
