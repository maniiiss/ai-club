package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record GitlabAutoMergeConfigRequest(
        @NotBlank(message = "配置名称不能为空")
        @Size(max = 120, message = "配置名称不能超过120个字符")
        String name,
        @NotBlank(message = "执行模式不能为空")
        @Size(max = 20, message = "执行模式不能超过20个字符")
        String executionMode,
        @Size(max = 500, message = "配置描述不能超过500个字符")
        String description,
        Long bindingId,
        @Size(max = 255, message = "GitLab API URL不能超过255个字符")
        String apiBaseUrl,
        @Size(max = 255, message = "GitLab项目引用不能超过255个字符")
        String gitlabProjectRef,
        @Size(max = 500, message = "Token不能超过500个字符")
        String apiToken,
        @Size(max = 100, message = "源分支不能超过100个字符")
        String sourceBranch,
        @Size(max = 100, message = "目标分支不能超过100个字符")
        String targetBranch,
        @Size(max = 120, message = "标题关键词不能超过120个字符")
        String titleKeyword,
        Boolean enabled,
        Boolean autoMerge,
        Boolean squashOnMerge,
        Boolean removeSourceBranch,
        Boolean triggerPipelineAfterMerge,
        Boolean requirePipelineSuccess,
        Boolean schedulerEnabled,
        @Size(max = 100, message = "Cron表达式不能超过100个字符")
        String schedulerCron,
        Long reviewAgentId,
        Long aiModelConfigId,
        Boolean aiReviewEnabled,
        @Size(max = 5000, message = "AI Review 提示不能不能超过5000个字符")
        String aiReviewPrompt,
        @Size(max = 20, message = "AI Review 严格度不能超过20个字符")
        String reviewStrictness
) {
}
