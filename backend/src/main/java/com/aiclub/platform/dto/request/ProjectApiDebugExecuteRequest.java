package com.aiclub.platform.dto.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;

import java.util.List;

public record ProjectApiDebugExecuteRequest(
        Long environmentId,
        @Size(max = 12, message = "HTTP 方法长度不能超过12")
        String method,
        @Size(max = 500, message = "接口路径长度不能超过500")
        String path,
        @Size(max = 120, message = "请求内容类型长度不能超过120")
        String requestContentType,
        @Valid
        List<ProjectApiKeyValueItemRequest> pathParams,
        @Valid
        List<ProjectApiKeyValueItemRequest> queryParams,
        @Valid
        List<ProjectApiKeyValueItemRequest> headerParams,
        String bodyText
) {
}
