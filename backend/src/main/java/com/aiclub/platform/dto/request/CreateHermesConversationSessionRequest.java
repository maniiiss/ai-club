package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 创建 Hermes 云端会话时使用的请求体。
 */
public record CreateHermesConversationSessionRequest(
        @NotBlank(message = "当前路由不能为空")
        @Size(max = 80, message = "当前路由长度不能超过 80 个字符")
        String routeName,
        Long projectId,
        Long taskId,
        Long iterationId,
        Long planId,
        Long wikiSpaceId,
        Long wikiPageId
) {
    /**
     * 兼容旧调用方：未提供 Wiki 绑定信息时自动置空。
     */
    public CreateHermesConversationSessionRequest(String routeName,
                                                  Long projectId,
                                                  Long taskId,
                                                  Long iterationId,
                                                  Long planId) {
        this(routeName, projectId, taskId, iterationId, planId, null, null);
    }
}
