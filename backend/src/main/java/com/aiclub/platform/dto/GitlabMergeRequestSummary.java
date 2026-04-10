package com.aiclub.platform.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public record GitlabMergeRequestSummary(
        Long iid,
        String title,
        String state,
        String sourceBranch,
        String targetBranch,
        Boolean draft,
        Boolean hasConflicts,
        String detailedMergeStatus,
        @JsonProperty("diverged_commits_count")
        Integer divergedCommitsCount,
        String pipelineStatus,
        String authorName,
        String webUrl,
        String updatedAt
) {
}
