package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * GitLab 绑定仓库发起扫描请求。
 */
public record GitlabBindingScanTaskRequest(
        @NotBlank(message = "扫描分支不能为空")
        @Size(max = 120, message = "扫描分支长度不能超过 120")
        String branch,
        @NotBlank(message = "规则集不能为空")
        @Size(max = 100, message = "规则集长度不能超过 100")
        String rulesetCode
) {
}
