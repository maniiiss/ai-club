package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record SelfUpgradePatrolTargetRequest(
        Long id,
        @NotBlank(message = "目标名称不能为空")
        @Size(max = 120, message = "目标名称不能超过120个字符")
        String name,
        @NotBlank(message = "入口地址不能为空")
        @Size(max = 500, message = "入口地址不能超过500个字符")
        String seedUrl,
        String goalPrompt,
        @Size(max = 300, message = "ready selector 不能超过300个字符")
        String readySelector,
        Boolean allowWrite,
        String writeAllowlistOverrideJson,
        Integer maxStepsOverride,
        Integer sortOrder,
        Boolean enabled
) {
}
