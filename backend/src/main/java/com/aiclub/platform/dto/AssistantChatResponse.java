package com.aiclub.platform.dto;

import java.util.List;

/**
 * Assistant 平台内置助手的非流式响应体。
 */
public record AssistantChatResponse(
        String scopeKey,
        String roleName,
        String content,
        List<AssistantReferenceSummary> references,
        List<String> suggestions,
        List<AssistantActionSummary> actions,
        List<AssistantSelectionCard> selectionCards,
        AssistantDebugInfo debug,
        List<AssistantAttachmentSummary> attachments
) {
    public AssistantChatResponse {
        attachments = attachments == null ? List.of() : List.copyOf(attachments);
    }
}
