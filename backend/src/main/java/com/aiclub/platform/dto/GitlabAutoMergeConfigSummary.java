package com.aiclub.platform.dto;

import java.util.List;

public record GitlabAutoMergeConfigSummary(
        Long id,
        String name,
        String executionMode,
        String description,
        Long bindingId,
        Long projectId,
        String projectName,
        String apiBaseUrl,
        String gitlabProjectRef,
        Boolean tokenConfigured,
        Long reviewAgentId,
        String reviewAgentName,
        Long aiModelConfigId,
        String aiModelConfigName,
        String aiModelProvider,
        String aiModelName,
        String sourceBranch,
        String targetBranch,
        String titleKeyword,
        Boolean enabled,
        Boolean autoMerge,
        Boolean squashOnMerge,
        Boolean removeSourceBranch,
        Boolean triggerPipelineAfterMerge,
        Boolean requirePipelineSuccess,
        Boolean schedulerEnabled,
        String schedulerCron,
        String nextExecutionTime,
        Boolean aiReviewEnabled,
        String aiReviewPrompt,
        String reviewStrictness,
        List<GitlabAutoMergePipelineTargetSummary> pipelineTargets,
        String lastRunStatus,
        String lastRunMessage,
        String lastRunAt
) {
}
