package com.aiclub.platform.dto;

import java.util.List;

/**
 * 文档转 Markdown 的统一结果。
 */
public record DocumentMarkdownResult(
        Long assetId,
        String fileName,
        String suggestedTitle,
        String sourceFormat,
        String markdown,
        boolean truncated,
        List<String> warnings
) {
    public DocumentMarkdownResult {
        warnings = warnings == null ? List.of() : List.copyOf(warnings);
    }
}
