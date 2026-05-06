package com.aiclub.platform.dto.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

public record ProjectApiResponseExampleRequest(
        @Size(max = 120, message = "响应名称长度不能超过120")
        String name,
        @NotNull(message = "响应状态码不能为空")
        Integer statusCode,
        @Size(max = 120, message = "响应类型长度不能超过120")
        String contentType,
        @Valid
        List<ProjectApiKeyValueItemRequest> headers,
        String bodyExample,
        @Size(max = 1000, message = "响应说明长度不能超过1000")
        String description
) {
}
