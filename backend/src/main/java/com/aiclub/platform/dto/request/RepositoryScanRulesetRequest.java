package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 仓库扫描规则集新增/编辑请求体。
 */
public record RepositoryScanRulesetRequest(
        @NotBlank(message = "规则集编码不能为空")
        @Size(max = 100, message = "规则集编码长度不能超过100")
        String code,
        @NotBlank(message = "规则集名称不能为空")
        @Size(max = 120, message = "规则集名称长度不能超过120")
        String name,
        @Size(max = 500, message = "规则集描述长度不能超过500")
        String description,
        @NotBlank(message = "扫描引擎不能为空")
        @Size(max = 30, message = "扫描引擎长度不能超过30")
        String engineType,
        Boolean enabled,
        Boolean defaultSelected,
        @NotBlank(message = "规则内容不能为空")
        String definitionContent
) {
}
