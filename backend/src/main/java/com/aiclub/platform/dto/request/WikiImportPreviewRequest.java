package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotNull;

/**
 * Wiki 文档导入预览请求。
 */
public record WikiImportPreviewRequest(
        @NotNull(message = "文档资产不能为空")
        Long assetId
) {
}
