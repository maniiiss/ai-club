package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.Size;

/**
 * 更新 Hermes 个人文件库条目时使用的请求体。
 */
public record UpdateHermesFileLibraryItemRequest(
        @Size(max = 200, message = "标题长度不能超过 200 个字符")
        String title,
        @Size(max = 500, message = "描述长度不能超过 500 个字符")
        String description,
        Boolean enabled
) {
}
