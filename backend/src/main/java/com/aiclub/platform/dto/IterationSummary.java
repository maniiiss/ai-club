package com.aiclub.platform.dto;

public record IterationSummary(
        Long id,
        Long projectId,
        String projectName,
        Long creatorUserId,
        String name,
        String goal,
        String status,
        String startDate,
        String endDate,
        String description,
        Integer sortOrder,
        Integer workItemCount,
        boolean canDelete
) {
}
