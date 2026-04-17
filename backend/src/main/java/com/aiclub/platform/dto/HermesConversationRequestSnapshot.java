package com.aiclub.platform.dto;

import com.aiclub.platform.dto.request.HermesChatRequest;

/**
 * Hermes 当前问题请求的可持久化快照。
 * 内部工具执行接口会使用它恢复本轮问题、路由和页面锚点。
 */
public record HermesConversationRequestSnapshot(
        String question,
        String routeName,
        Long projectId,
        Long taskId,
        Long iterationId,
        Long planId,
        Long wikiSpaceId,
        Long wikiPageId
) {
    public HermesConversationRequestSnapshot {
        question = question == null ? "" : question.trim();
        routeName = routeName == null ? "" : routeName.trim();
    }

    /**
     * 从公开聊天请求构造内部快照。
     */
    public static HermesConversationRequestSnapshot fromRequest(HermesChatRequest request) {
        if (request == null) {
            return new HermesConversationRequestSnapshot("", "", null, null, null, null, null, null);
        }
        return new HermesConversationRequestSnapshot(
                request.question(),
                request.routeName(),
                request.projectId(),
                request.taskId(),
                request.iterationId(),
                request.planId(),
                request.wikiSpaceId(),
                request.wikiPageId()
        );
    }

    /**
     * 恢复给内部工具编排复用的聊天请求对象。
     */
    public HermesChatRequest toChatRequest(String clientConversationId) {
        return new HermesChatRequest(
                question,
                routeName,
                projectId,
                taskId,
                iterationId,
                planId,
                wikiSpaceId,
                wikiPageId,
                clientConversationId,
                null,
                Boolean.FALSE
        );
    }
}
