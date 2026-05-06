package com.aiclub.platform.dto;

/**
 * API 参数表项。
 */
public record ProjectApiParameterSummary(
        String name,
        Boolean required,
        String type,
        String example,
        String description
) {
}
