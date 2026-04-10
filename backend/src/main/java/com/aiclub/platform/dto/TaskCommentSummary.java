package com.aiclub.platform.dto;

public record TaskCommentSummary(
        Long id,
        Long taskId,
        Long authorUserId,
        String authorName,
        String content,
        String createdAt
) {
}
