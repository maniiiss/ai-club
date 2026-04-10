package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 创建 GitLab Tag 的请求体。
 *
 * @param tagName Tag 名称
 * @param branchName 来源分支名称
 * @param message Tag 备注说明
 */
public record GitlabTagCreateRequest(
        @NotBlank(message = "Tag 名称不能为空")
        @Size(max = 255, message = "Tag 名称长度不能超过255")
        String tagName,
        @NotBlank(message = "来源分支不能为空")
        @Size(max = 255, message = "来源分支长度不能超过255")
        String branchName,
        @Size(max = 2000, message = "Tag 备注长度不能超过2000")
        String message
) {
}
