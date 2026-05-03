package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotNull;
public record ProjectGiteeBindingRequest(
        @NotNull(message = "Gitee 项目不能为空")
        Long giteeProgramId,
        Boolean enabled
) {
}
