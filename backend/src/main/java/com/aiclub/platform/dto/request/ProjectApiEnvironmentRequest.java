package com.aiclub.platform.dto.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.Map;

public record ProjectApiEnvironmentRequest(
        @NotBlank(message = "环境名称不能为空")
        @Size(max = 120, message = "环境名称长度不能超过120")
        String name,
        @NotBlank(message = "基础地址不能为空")
        @Size(max = 500, message = "基础地址长度不能超过500")
        String baseUrl,
        Map<String, String> variables,
        @Size(max = 30, message = "鉴权类型长度不能超过30")
        String authType,
        @Valid
        ProjectApiEnvironmentAuthConfigRequest authConfig,
        Boolean isDefault
) {
}
