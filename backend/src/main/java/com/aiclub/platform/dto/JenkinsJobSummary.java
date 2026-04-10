package com.aiclub.platform.dto;

public record JenkinsJobSummary(
        String name,
        String fullName,
        String url,
        String color,
        Integer lastBuildNumber,
        String lastBuildResult,
        String lastBuildUrl,
        String lastBuildAt
) {
}
