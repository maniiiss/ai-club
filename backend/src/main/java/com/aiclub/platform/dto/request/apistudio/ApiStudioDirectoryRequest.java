package com.aiclub.platform.dto.request.apistudio;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 创建/编辑目录请求。
 */
public record ApiStudioDirectoryRequest(
        Long parentId,
        @NotBlank @Size(max = 255) String name,
        String description,
        Integer sortOrder
) {
}
