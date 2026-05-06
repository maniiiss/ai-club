package com.aiclub.platform.dto;

/**
 * 文档资产上传后的摘要信息。
 */
public record DocumentAssetSummary(
        Long id,
        String fileName,
        String contentType,
        long fileSize,
        String sourceFormat,
        String bindingStatus,
        String url
) {
}
