package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record JenkinsServerRequest(
        @NotBlank(message = "Jenkins 名称不能为空")
        @Size(max = 100, message = "Jenkins 名称长度不能超过100")
        String name,
        @NotBlank(message = "Jenkins 地址不能为空")
        @Size(max = 255, message = "Jenkins 地址长度不能超过255")
        String baseUrl,
        @NotBlank(message = "Jenkins 用户名不能为空")
        @Size(max = 100, message = "Jenkins 用户名长度不能超过100")
        String username,
        @Size(max = 500, message = "API Token 长度不能超过500")
        String apiToken,
        @Size(max = 500, message = "描述长度不能超过500")
        String description,
        @NotNull(message = "启用状态不能为空")
        Boolean enabled
) {
}
