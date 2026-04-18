package com.aiclub.platform.dto;

/**
 * Wiki 空间详情。
 */
public record WikiSpaceDetail(
        Long id,
        String name,
        String description,
        String readScope,
        Long boundProjectId,
        String boundProjectName,
        String memberDefaultSource,
        String currentUserRole,
        String creatorName,
        Integer directoryCount,
        Integer pageCount,
        Integer boundProjectCount,
        boolean canManage,
        String createdAt,
        String updatedAt
) {
}
