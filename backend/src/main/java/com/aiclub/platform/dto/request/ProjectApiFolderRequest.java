package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ProjectApiFolderRequest(
        Long parentFolderId,
        @NotBlank(message = "目录名称不能为空")
        @Size(max = 120, message = "目录名称长度不能超过120")
        String name,
        Integer sortOrder
) {
}
