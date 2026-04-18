package com.aiclub.platform.dto.request;

import jakarta.validation.Valid;
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
        Long wikiSpaceId,
        Long wikiPageId,
        @Size(max = 120, message = "会话标识长度不能超过 120 个字符")
        String clientConversationId,
        /**
         * 当用户从歧义候选卡片中选定对象时，前端会把选择结果一并带回。
         */
        @Valid
        HermesSelectionRequest selection,
        /**
         * 调试模式仅用于前端展示内部规划轨迹，默认关闭。
         */
        Boolean debug
) {
    /**
     * 兼容旧调用方：未提供 Wiki 绑定信息时自动置空。
     */
    public HermesChatRequest(String question,
                             String routeName,
                             Long projectId,
                             Long taskId,
                             Long iterationId,
                             Long planId,
                             String clientConversationId,
                             HermesSelectionRequest selection,
                             Boolean debug) {
        this(question, routeName, projectId, taskId, iterationId, planId, null, null, clientConversationId, selection, debug);
    }
}
