package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * 创建或更新业主代码仓库绑定的请求。
 * apiToken 在创建时必填，更新时留空表示保留原 Token。
 */
public record OwnerRepoBindingRequest(
        @NotNull(message = "项目不能为空")
        Long projectId,
        @Size(max = 100, message = "绑定名称长度不能超过100")
        String name,
        @Size(max = 255, message = "GitLab API 地址长度不能超过255")
        String apiBaseUrl,
        @Size(max = 255, message = "GitLab 项目标识长度不能超过255")
        String gitlabProjectRef,
        @Size(max = 100, message = "默认目标分支长度不能超过100")
        String defaultTargetBranch,
        @Size(max = 20, message = "默认推送方式长度不能超过20")
        String defaultPushMode,
        @Size(max = 500, message = "Token 长度不能超过500")
        String apiToken,
        Boolean enabled
) {
}
