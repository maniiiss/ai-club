package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotNull;

public record IterationGiteeBindingRequest(
        @NotNull(message = "Gitee 里程碑不能为空")
        Long giteeMilestoneId
) {
}
