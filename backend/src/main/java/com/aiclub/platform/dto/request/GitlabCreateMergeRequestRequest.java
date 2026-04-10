package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 首页与 GitLab 管理页共用的创建 Merge Request 请求体。
 *
 * @param sourceBranch 源分支
 * @param targetBranch 目标分支
 * @param title Merge Request 标题
 * @param description Merge Request 描述
 */
public record GitlabCreateMergeRequestRequest(
        @NotBlank(message = "源分支不能为空")
        @Size(max = 255, message = "源分支长度不能超过255")
        String sourceBranch,
        @NotBlank(message = "目标分支不能为空")
        @Size(max = 255, message = "目标分支长度不能超过255")
        String targetBranch,
        @NotBlank(message = "MR 标题不能为空")
        @Size(max = 255, message = "MR 标题长度不能超过255")
        String title,
        @Size(max = 2000, message = "MR 描述长度不能超过2000")
        String description
) {
}
