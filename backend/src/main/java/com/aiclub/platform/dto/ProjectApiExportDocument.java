package com.aiclub.platform.dto;

/**
 * OpenAPI 导出文档内容。
 */
public record ProjectApiExportDocument(
        String fileName,
        String format,
        String content
) {
}
