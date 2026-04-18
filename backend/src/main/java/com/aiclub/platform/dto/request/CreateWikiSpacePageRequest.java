package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * 创建空间化 Wiki 页面请求。
 */
public record CreateWikiSpacePageRequest(
        @NotNull(message = "目录不能为空")
        Long directoryId,
        /** 父页面 ID，空表示创建为目录下一级页面。 */
        Long parentPageId,
        @NotBlank(message = "页面标题不能为空")
        @Size(max = 200, message = "页面标题长度不能超过200")
        String title,
        @Size(max = 200000, message = "页面内容长度不能超过200000")
        String content
) {
}
