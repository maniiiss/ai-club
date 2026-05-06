package com.aiclub.platform.dto.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.List;

public record ProjectApiEndpointRequest(
        Long folderId,
        @NotBlank(message = "接口名称不能为空")
        @Size(max = 160, message = "接口名称长度不能超过160")
        String name,
        @NotBlank(message = "HTTP 方法不能为空")
        @Size(max = 12, message = "HTTP 方法长度不能超过12")
        String method,
        @NotBlank(message = "接口路径不能为空")
        @Size(max = 500, message = "接口路径长度不能超过500")
        String path,
        @Size(max = 200, message = "接口摘要长度不能超过200")
        String summary,
        String descriptionMarkdown,
        @Size(max = 120, message = "请求内容类型长度不能超过120")
        String requestContentType,
        @Valid
        List<ProjectApiParameterItemRequest> pathParams,
        @Valid
        List<ProjectApiParameterItemRequest> queryParams,
        @Valid
        List<ProjectApiParameterItemRequest> headerParams,
        String bodyExampleText,
        @Valid
        List<ProjectApiResponseExampleRequest> responseExamples,
        @Valid
        ProjectApiDebugConfigRequest debugConfig
) {
}
