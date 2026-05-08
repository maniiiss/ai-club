package com.aiclub.platform.dto;

/**
 * Yaade 可用性摘要，供前端错误态和部署巡检复用。
 */
public record YaadeHealthSummary(
        boolean available,
        String baseUrl,
        String message
) {
}
