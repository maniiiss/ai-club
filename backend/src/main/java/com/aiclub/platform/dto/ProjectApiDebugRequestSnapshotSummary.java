package com.aiclub.platform.dto;

import java.util.List;

/**
 * 调试请求快照。
 */
public record ProjectApiDebugRequestSnapshotSummary(
        String method,
        String url,
        String contentType,
        List<ProjectApiKeyValueSummary> headers,
        String body
) {
}
