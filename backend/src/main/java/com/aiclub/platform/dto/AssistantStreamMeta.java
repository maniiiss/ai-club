package com.aiclub.platform.dto;

import java.util.List;
import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * 前端开始接收流式回答前的元信息事件。
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record AssistantStreamMeta(
        String scopeKey,
        String roleName,
        List<AssistantReferenceSummary> references,
        List<String> suggestions,
        List<AssistantActionSummary> actions,
        List<AssistantSelectionCard> selectionCards,
        AssistantDebugInfo debug,
        List<AssistantAttachmentSummary> attachments
) {
    public AssistantStreamMeta {
        attachments = attachments == null ? List.of() : List.copyOf(attachments);
    }
}
