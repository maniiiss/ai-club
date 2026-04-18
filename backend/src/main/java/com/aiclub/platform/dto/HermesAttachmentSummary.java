package com.aiclub.platform.dto;

import java.util.List;

/**
 * Hermes 会话消息附件摘要，用于历史消息回显和下载。
 */
public record HermesAttachmentSummary(
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
    public HermesAttachmentSummary {
        warnings = warnings == null ? List.of() : List.copyOf(warnings);
    }
}
