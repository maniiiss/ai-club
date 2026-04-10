package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record ProjectPipelineBindingRequest(
        @NotNull(message = "项目不能为空")
        Long projectId,
        @NotNull(message = "Jenkins 服务不能为空")
        Long jenkinsServerId,
        @NotBlank(message = "Job 名称不能为空")
        @Size(max = 255, message = "Job 名称长度不能超过255")
        String jobName,
        @Size(max = 100, message = "默认分支长度不能超过100")
        String defaultBranch,
        @Size(max = 4000, message = "构建参数 JSON 长度不能超过4000")
        String buildParametersJson,
        @NotNull(message = "启用状态不能为空")
        Boolean enabled
) {
}
