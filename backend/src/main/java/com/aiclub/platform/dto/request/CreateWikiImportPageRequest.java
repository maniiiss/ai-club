package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * 从已上传文档资产创建 Wiki 页面请求。
 */
public record CreateWikiImportPageRequest(
        @NotNull(message = "文档资产不能为空")
        Long assetId,
        @NotNull(message = "目录不能为空")
        Long directoryId,
        @NotBlank(message = "页面标题不能为空")
        @Size(max = 200, message = "页面标题长度不能超过200")
        String title
) {
}
