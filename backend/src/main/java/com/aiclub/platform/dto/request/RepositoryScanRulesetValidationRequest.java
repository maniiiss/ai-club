package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 仓库扫描规则集手动校验请求。
 */
public record RepositoryScanRulesetValidationRequest(
        @NotBlank(message = "扫描引擎不能为空")
        @Size(max = 30, message = "扫描引擎长度不能超过30")
        String engineType,
        @NotBlank(message = "规则内容不能为空")
        String definitionContent
) {
}
