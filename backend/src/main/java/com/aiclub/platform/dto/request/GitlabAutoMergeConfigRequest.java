package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record GitlabAutoMergeConfigRequest(
        @NotBlank(message = "????????")
        @Size(max = 120, message = "??????????120")
        String name,
        @NotBlank(message = "????????")
        @Size(max = 20, message = "??????????20")
        String executionMode,
        @Size(max = 500, message = "????????500")
        String description,
        Long bindingId,
        @Size(max = 255, message = "GitLab API ????????255")
        String apiBaseUrl,
        @Size(max = 255, message = "GitLab ??????????255")
        String gitlabProjectRef,
        @Size(max = 500, message = "Token ??????500")
        String apiToken,
        @Size(max = 100, message = "?????????100")
        String sourceBranch,
        @Size(max = 100, message = "??????????100")
        String targetBranch,
        @Size(max = 120, message = "???????????120")
        String titleKeyword,
        Boolean enabled,
        Boolean autoMerge,
        Boolean squashOnMerge,
        Boolean removeSourceBranch,
        Boolean triggerPipelineAfterMerge,
        Boolean requirePipelineSuccess,
        Boolean schedulerEnabled,
        @Size(max = 100, message = "Cron ??????100")
        String schedulerCron,
        Long reviewAgentId,
        Long aiModelConfigId,
        Boolean aiReviewEnabled,
        @Size(max = 5000, message = "AI Review ?????????5000")
        String aiReviewPrompt
) {
}
