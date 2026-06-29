package com.aiclub.platform.dto;

import java.util.List;

/**
 * 聊天室附件回显摘要。
 */
public record ChatAttachmentSummary(
        Long id,
        Long assetId,
        String fileName,
        String contentType,
        long fileSize,
        String sourceFormat,
        String suggestedTitle,
        boolean truncated,
        List<String> warnings,
        String createdAt
) {
    public ChatAttachmentSummary {
        warnings = warnings == null ? List.of() : List.copyOf(warnings);
    }
}
