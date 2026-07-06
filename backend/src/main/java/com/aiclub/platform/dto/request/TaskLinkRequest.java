package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotNull;

public record TaskLinkRequest(
        @NotNull(message = "关联对象不能为空")
        Long targetId
) {
}
