package com.aiclub.platform.dto;

public record AiClubPipelineRunLogDetail(
        String projectName,
        String pipelineName,
        String repoFullName,
        Integer runNumber,
        String status,
        String branch,
        String url,
        String startedAt,
        String finishedAt,
        String consoleLog
) {
}
