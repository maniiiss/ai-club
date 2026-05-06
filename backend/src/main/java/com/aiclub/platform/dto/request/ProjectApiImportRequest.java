package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ProjectApiImportRequest(
        @NotBlank(message = "导入格式不能为空")
        @Size(max = 10, message = "导入格式长度不能超过10")
        String format,
        @Size(max = 255, message = "文件名长度不能超过255")
        String fileName,
        @NotBlank(message = "导入内容不能为空")
        String content
) {
}
