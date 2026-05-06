package com.aiclub.platform.dto;

/**
 * 通用键值对摘要，复用于请求头、响应头和调试参数展示。
 */
public record ProjectApiKeyValueSummary(
        String name,
        String value,
        Boolean enabled
) {
}
