package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 顶部 Hermes 助手的流式问答请求。
 */
public record HermesChatRequest(
        @NotBlank(message = "问题不能为空")
        @Size(max = 2000, message = "问题长度不能超过 2000 个字符")
        String question,
        @NotBlank(message = "当前路由不能为空")
        @Size(max = 80, message = "当前路由长度不能超过 80 个字符")
        String routeName,
        Long projectId,
        Long taskId,
        Long iterationId,
        Long planId,
        @Size(max = 120, message = "会话标识长度不能超过 120 个字符")
        String clientConversationId
) {
}
