package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record AgentTestRequest(
        @NotBlank(message = "测试问题不能为空")
        @Size(max = 20000, message = "测试问题不能超过20000个字符")
        String input
) {
}
