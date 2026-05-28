package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.Map;

public record AiClubPipelineRequest(
        @NotNull(message = "项目不能为空")
        Long projectId,
        @NotNull(message = "GitLab 绑定不能为空")
        Long gitlabBindingId,
        @NotBlank(message = "流水线名称不能为空")
        @Size(max = 120, message = "流水线名称长度不能超过120")
        String name,
        @Size(max = 100, message = "默认分支长度不能超过100")
        String defaultBranch,
        @Size(max = 255, message = "配置文件路径长度不能超过255")
        String configPath,
        Map<String, String> triggerVariables,
        @NotNull(message = "启用状态不能为空")
        Boolean enabled
) {
}
