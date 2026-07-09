package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * 触发业主仓库代码推送的请求。
 * 指定源 GitLab 绑定、源分支、目标分支与推送方式。
 */
public record OwnerRepoPushRequest(
        @NotNull(message = "源 GitLab 绑定不能为空")
        Long sourceBindingId,
        @NotNull(message = "源分支不能为空")
        @Size(max = 100, message = "源分支长度不能超过100")
        String sourceBranch,
        @NotNull(message = "目标分支不能为空")
        @Size(max = 100, message = "目标分支长度不能超过100")
        String targetBranch,
        @Size(max = 20, message = "推送方式长度不能超过20")
        String pushMode
) {
}
