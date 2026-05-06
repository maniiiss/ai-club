package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.Size;

public record ProjectApiParameterItemRequest(
        @Size(max = 200, message = "参数名长度不能超过200")
        String name,
        Boolean required,
        @Size(max = 60, message = "参数类型长度不能超过60")
        String type,
        @Size(max = 2000, message = "参数示例长度不能超过2000")
        String example,
        @Size(max = 1000, message = "参数说明长度不能超过1000")
        String description
) {
}
