package com.aiclub.platform.dto;

import java.util.List;

/**
 * Hermes 平台内置助手的非流式响应体。
 */
public record HermesChatResponse(
        String scopeKey,
        String roleName,
        String content,
        List<HermesReferenceSummary> references,
        List<String> suggestions,
        List<HermesActionSummary> actions,
        List<HermesSelectionCard> selectionCards,
        HermesDebugInfo debug,
        List<HermesAttachmentSummary> attachments
) {
    public HermesChatResponse {
        attachments = attachments == null ? List.of() : List.copyOf(attachments);
    }
}
