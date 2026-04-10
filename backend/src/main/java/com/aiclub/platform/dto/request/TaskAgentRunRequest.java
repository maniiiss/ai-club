package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.Size;

public record TaskAgentRunRequest(
        @Size(max = 20000, message = "任务 Agent 输入长度不能超过 20000")
        String input
) {
}
