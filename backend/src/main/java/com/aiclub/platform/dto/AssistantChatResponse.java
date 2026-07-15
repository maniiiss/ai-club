package com.aiclub.platform.dto;

import java.util.List;
import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Assistant 平台内置助手的非流式响应体。
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record AssistantChatResponse(
        Long sessionId,
        Long userMessageId,
        Long assistantMessageId,
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
