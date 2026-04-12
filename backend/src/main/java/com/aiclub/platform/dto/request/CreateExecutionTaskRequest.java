package com.aiclub.platform.dto.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.Map;

/**
 * 创建执行中心任务请求。
 */
public record CreateExecutionTaskRequest(
        @NotBlank(message = "场景编码不能为空")
        @Size(max = 50, message = "场景编码长度不能超过 50")
        String scenarioCode,
        @NotNull(message = "项目不能为空")
        Long projectId,
        Long workItemId,
        @Size(max = 200, message = "标题长度不能超过 200")
        String title,
        @Size(max = 40, message = "触发来源长度不能超过 40")
        String triggerSource,
        @Valid
        List<ExecutionAgentBindingRequest> agentBindings,
        Map<String, Object> inputPayload
) {
}
