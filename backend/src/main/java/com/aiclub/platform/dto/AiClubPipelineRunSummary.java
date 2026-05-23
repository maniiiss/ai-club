package com.aiclub.platform.dto;

public record AiClubPipelineRunSummary(
        Integer number,
        String status,
        String branch,
        String event,
        String message,
        String commit,
        String url,
        String createdAt,
        String startedAt,
        String finishedAt,
        Long durationMillis,
        String durationText
) {
}
