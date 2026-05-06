package com.aiclub.platform.dto;

import java.util.List;

/**
 * API 响应示例。
 */
public record ProjectApiResponseExampleSummary(
        String name,
        Integer statusCode,
        String contentType,
        List<ProjectApiKeyValueSummary> headers,
        String bodyExample,
        String description
) {
}
