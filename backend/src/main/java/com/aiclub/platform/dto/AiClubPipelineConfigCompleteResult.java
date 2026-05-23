package com.aiclub.platform.dto;

public record AiClubPipelineConfigCompleteResult(
        String branchName,
        String commitId,
        String commitUrl,
        Long mergeRequestIid,
        String mergeRequestUrl,
        String message
) {
}
