package com.aiclub.platform.dto;

import java.util.List;
import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * 流式回答完成后的终态事件。
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record AssistantStreamDone(
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
    public AssistantStreamDone {
        attachments = attachments == null ? List.of() : List.copyOf(attachments);
    }
}
