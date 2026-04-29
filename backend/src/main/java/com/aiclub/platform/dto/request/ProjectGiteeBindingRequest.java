package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record ProjectGiteeBindingRequest(
        @NotNull(message = "企业ID不能为空")
        Long enterpriseId,
        @Size(max = 255, message = "Gitee API 地址长度不能超过255")
        String apiBaseUrl,
        @NotNull(message = "Gitee 项目不能为空")
        Long giteeProgramId,
        @Size(max = 500, message = "Access Token 长度不能超过500")
        String accessToken,
        Boolean enabled
) {
}
