package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.Size;

/**
 * GitNexus 全仓图启动请求。
 */
public record GitlabGitnexusLaunchRequest(
        @Size(max = 120, message = "分支长度不能超过 120")
        String branch
) {
}
