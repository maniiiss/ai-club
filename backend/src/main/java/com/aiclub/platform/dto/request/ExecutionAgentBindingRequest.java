package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * 执行任务创建时的步骤 Agent 绑定。
 */
public record ExecutionAgentBindingRequest(
        @NotBlank(message = "步骤编码不能为空")
        @Size(max = 50, message = "步骤编码长度不能超过 50")
        String stepCode,
        @NotNull(message = "步骤 Agent 不能为空")
        Long agentId
) {
}
