package com.aiclub.platform.dto;

import java.util.List;

/**
 * Wiki 页面导入来源文件摘要。
 */
public record WikiImportSourceSummary(
        Long assetId,
        String fileName,
        String contentType,
        long fileSize,
        String sourceFormat,
        boolean truncated,
        List<String> warnings
) {
    public WikiImportSourceSummary {
        warnings = warnings == null ? List.of() : List.copyOf(warnings);
    }
}
