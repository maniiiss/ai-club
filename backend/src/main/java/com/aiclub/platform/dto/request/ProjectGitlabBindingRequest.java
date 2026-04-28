package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record ProjectGitlabBindingRequest(
        @NotNull(message = "项目不能为空")
        Long projectId,
        @Size(max = 255, message = "GitLab API 地址长度不能超过255")
        String apiBaseUrl,
        @Size(max = 255, message = "GitLab 项目标识长度不能超过255")
        String gitlabProjectRef,
        @Size(max = 100, message = "默认目标分支长度不能超过100")
        String defaultTargetBranch,
        @Size(max = 100, message = "产品主线分支长度不能超过100")
        String productMainBranch,
        String testProfileJson,
        @Size(max = 500, message = "Token 长度不能超过500")
        String apiToken,
        Boolean enabled
) {
}
