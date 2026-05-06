package com.aiclub.platform.dto;

/**
 * API 调试记录摘要。
 */
public record ProjectApiDebugRecordSummary(
        Long id,
        Long endpointId,
        String endpointName,
        Long environmentId,
        String environmentName,
        Boolean success,
        String errorMessage,
        Long durationMillis,
        ProjectApiDebugRequestSnapshotSummary requestSnapshot,
        ProjectApiDebugResponseSnapshotSummary responseSnapshot,
        String createdByName,
        String createdAt
) {
}
