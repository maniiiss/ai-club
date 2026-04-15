package com.aiclub.platform.dto;

/**
 * 仓库扫描规则集后台管理摘要。
 */
public record RepositoryScanRulesetAdminSummary(
        Long id,
        String code,
        String name,
        String description,
        String engineType,
        boolean enabled,
        boolean defaultSelected,
        String definitionContent
) {
}
