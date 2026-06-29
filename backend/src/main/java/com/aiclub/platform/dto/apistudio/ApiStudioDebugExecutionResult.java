package com.aiclub.platform.dto.apistudio;

import java.util.List;
import java.util.Map;

/**
 * 原生 API 工作台 - 调试执行返回结果。
 * 同时包含写入的 debug record id 和实时响应快照。
 */
public record ApiStudioDebugExecutionResult(
        Long debugRecordId,
        Boolean success,
        Integer statusCode,
        Long durationMillis,
        String errorMessage,
        String finalUrl,
        String requestMethod,
        Map<String, List<String>> requestHeaders,
        String requestBodyPreview,
        Map<String, List<String>> responseHeaders,
        String responseBody,
        Long responseBytes,
        Boolean responseTruncated
) {
}
