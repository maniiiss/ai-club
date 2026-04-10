package com.aiclub.platform.dto;

public record JenkinsBuildSummary(
        Integer number,
        String url,
        String result,
        Boolean building,
        String executedAt,
        Long durationMillis,
        String durationText,
        String description
) {
}
