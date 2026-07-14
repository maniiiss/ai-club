package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 前端在某条 Assistant 可执行动作完成后回报已执行 key 的请求体。
 */
public record AssistantActionExecutedRequest(
        /**
         * 动作的稳定唯一标识，由前端按 type:title:paramsHash 等规则生成。
         * 后端只负责持久化，不解析其结构。
         */
        @NotBlank(message = "动作标识不能为空")
        @Size(max = 256, message = "动作标识过长")
        String actionKey
) {
}
