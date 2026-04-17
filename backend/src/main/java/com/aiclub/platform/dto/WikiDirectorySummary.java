package com.aiclub.platform.dto;

/**
 * Wiki 目录摘要。
 */
public record WikiDirectorySummary(
        Long id,
        Long spaceId,
        Long parentDirectoryId,
        String name,
        String slug,
        String content,
        Integer sortOrder,
        Long boundProjectId,
        String boundProjectName,
        String createdByName,
        String createdAt,
        String updatedAt
) {
}
