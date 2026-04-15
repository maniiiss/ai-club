package com.aiclub.platform.dto;

/**
 * 仓库扫描规则集校验结果。
 */
public record RepositoryScanRulesetValidationResult(
        boolean success,
        String message
) {
}
