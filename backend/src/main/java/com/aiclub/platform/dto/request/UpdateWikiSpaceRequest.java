package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 更新 Wiki 空间请求。
 */
public record UpdateWikiSpaceRequest(
        @NotBlank(message = "Wiki 空间名称不能为空")
        @Size(max = 120, message = "Wiki 空间名称长度不能超过120")
        String name,
        @Size(max = 500, message = "Wiki 空间说明长度不能超过500")
        String description,
        @Size(max = 20, message = "读取范围长度不能超过20")
        String readScope,
        Long boundProjectId,
        @Size(max = 30, message = "成员默认来源长度不能超过30")
        String memberDefaultSource
) {
}
