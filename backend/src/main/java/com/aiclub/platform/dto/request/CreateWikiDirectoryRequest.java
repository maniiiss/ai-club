package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 创建 Wiki 目录请求。
 */
public record CreateWikiDirectoryRequest(
        @NotBlank(message = "目录名称不能为空")
        @Size(max = 120, message = "目录名称长度不能超过120")
        String name,
        @Size(max = 200000, message = "目录内容长度不能超过200000")
        String content,
        Long parentDirectoryId,
        Long boundProjectId
) {
}
