package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * 更新空间化 Wiki 页面请求。
 */
public record UpdateWikiSpacePageRequest(
        @NotNull(message = "目录不能为空")
        Long directoryId,
        @NotBlank(message = "页面标题不能为空")
        @Size(max = 200, message = "页面标题长度不能超过200")
        String title,
        @Size(max = 200000, message = "页面内容长度不能超过200000")
        String content,
        @Size(max = 500, message = "变更说明长度不能超过500")
        String changeSummary
) {
}
