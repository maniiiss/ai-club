package com.aiclub.platform.dto;

import java.util.List;

/**
 * 调试响应快照。
 */
public record ProjectApiDebugResponseSnapshotSummary(
        Integer statusCode,
        String contentType,
        List<ProjectApiKeyValueSummary> headers,
        Boolean binary,
        Long bodySize,
        String body,
        String bodyPreview
) {
}
