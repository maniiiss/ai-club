package com.aiclub.platform.dto;

/**
 * OpenAPI 导入结果摘要。
 */
public record ProjectApiImportResult(
        int folderCount,
        int endpointCount,
        int environmentCount
) {
}
