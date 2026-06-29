package com.aiclub.platform.dto.apistudio;

import java.time.LocalDateTime;

/**
 * 原生 API 工作台 - 个人调试记录摘要。
 */
public record ApiStudioDebugRecordItem(
        Long id,
        Long projectId,
        Long endpointId,
        Long environmentId,
        Long creatorUserId,
        String requestSnapshotJson,
        String responseSnapshotJson,
        Integer statusCode,
        Long durationMillis,
        Boolean success,
        String errorMessage,
        LocalDateTime createdAt
) {
}
