package com.aiclub.platform.dto;

public record JenkinsBuildLogDetail(
        String projectName,
        String jenkinsServerName,
        String jobName,
        Integer buildNumber,
        String result,
        Boolean building,
        String executedAt,
        Long durationMillis,
        String durationText,
        String url,
        String description,
        String consoleLog
) {
}
