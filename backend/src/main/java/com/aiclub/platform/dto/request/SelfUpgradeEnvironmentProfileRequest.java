package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record SelfUpgradeEnvironmentProfileRequest(
        Long id,
        @NotBlank(message = "环境编码不能为空")
        @Size(max = 40, message = "环境编码不能超过40个字符")
        String code,
        @NotBlank(message = "环境名称不能为空")
        @Size(max = 120, message = "环境名称不能超过120个字符")
        String name,
        @NotBlank(message = "基础地址不能为空")
        @Size(max = 255, message = "基础地址不能超过255个字符")
        String baseUrl,
        String allowedHostPatternsJson,
        String loginScriptJson,
        @Size(max = 120, message = "沙箱用户名不能超过120个字符")
        String sandboxUsername,
        String sandboxPassword,
        String sessionStateJson,
        String writeAllowlistJson,
        Boolean enabled
) {
}
