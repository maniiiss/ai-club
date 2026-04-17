package com.aiclub.platform.dto;

/**
 * Wiki 空间列表摘要。
 */
public record WikiSpaceSummary(
        Long id,
        String name,
        String description,
        String readScope,
        String currentUserRole,
        Integer directoryCount,
        Integer pageCount,
        Integer boundProjectCount,
        boolean canManage,
        String createdAt,
        String updatedAt
) {
}
