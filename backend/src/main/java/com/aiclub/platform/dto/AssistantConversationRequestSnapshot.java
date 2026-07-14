package com.aiclub.platform.dto;

import com.aiclub.platform.dto.request.AssistantChatRequest;

import java.util.List;

/**
 * Assistant 当前问题请求的可持久化快照。
 * 内部工具执行接口会使用它恢复本轮问题、路由和页面锚点。
 */
public record AssistantConversationRequestSnapshot(
        String question,
        String routeName,
        Long projectId,
        Long taskId,
        Long iterationId,
        Long planId,
        Long wikiSpaceId,
        Long wikiPageId,
        List<Long> attachmentAssetIds
) {
    public AssistantConversationRequestSnapshot {
        question = question == null ? "" : question.trim();
        routeName = routeName == null ? "" : routeName.trim();
        attachmentAssetIds = attachmentAssetIds == null ? List.of() : List.copyOf(attachmentAssetIds);
    }

    /**
     * 兼容旧调用方：未提供 Wiki/附件信息时自动置空。
     */
    public AssistantConversationRequestSnapshot(String question,
                                             String routeName,
                                             Long projectId,
                                             Long taskId,
                                             Long iterationId,
                                             Long planId) {
        this(question, routeName, projectId, taskId, iterationId, planId, null, null, List.of());
    }

    /**
     * 从公开聊天请求构造内部快照。
     */
    public static AssistantConversationRequestSnapshot fromRequest(AssistantChatRequest request) {
        if (request == null) {
            return new AssistantConversationRequestSnapshot("", "", null, null, null, null, null, null, List.of());
        }
        return new AssistantConversationRequestSnapshot(
                request.question(),
                request.routeName(),
                request.projectId(),
                request.taskId(),
                request.iterationId(),
                request.planId(),
                request.wikiSpaceId(),
                request.wikiPageId(),
                List.of()
        );
    }

    /**
     * 恢复给内部工具编排复用的聊天请求对象。
     */
    public AssistantChatRequest toChatRequest(String clientConversationId) {
        return new AssistantChatRequest(
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
                Boolean.FALSE,
                null
        );
    }
}
