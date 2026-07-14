package com.aiclub.platform.dto;

import java.util.List;

/**
 * 流式回答完成后的终态事件。
 */
public record AssistantStreamDone(
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
