package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.Size;

/**
 * GitLab 绑定仓库同步 API 到 Yaade 的请求体。
 */
public record GitlabApiSyncRequest(
        /**
         * 本次同步读取的 Git 分支；为空时按绑定默认分支回退。
         */
        @Size(max = 100, message = "同步分支长度不能超过100")
        String branch
) {
}
