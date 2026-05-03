package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.Size;

/**
 * 代码结构刷新请求。
 */
public record GitlabCodeStructureRefreshRequest(
        @Size(max = 120, message = "分支长度不能超过 120")
        String branch
) {
}
