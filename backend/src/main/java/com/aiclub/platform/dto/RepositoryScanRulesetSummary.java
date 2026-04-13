package com.aiclub.platform.dto;

/**
 * 仓库规范扫描规则集摘要。
 */
public record RepositoryScanRulesetSummary(
        String code,
        String name,
        String description
) {
}
