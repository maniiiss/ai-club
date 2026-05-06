package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ProjectApiProfileRequest(
        @NotBlank(message = "文档标题不能为空")
        @Size(max = 200, message = "文档标题长度不能超过200")
        String title,
        @Size(max = 1000, message = "文档说明长度不能超过1000")
        String description,
        @NotBlank(message = "文档版本不能为空")
        @Size(max = 60, message = "文档版本长度不能超过60")
        String version
) {
}
