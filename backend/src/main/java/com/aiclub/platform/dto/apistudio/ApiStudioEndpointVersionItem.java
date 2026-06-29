package com.aiclub.platform.dto.apistudio;

import java.time.LocalDateTime;

/**
 * 原生 API 工作台 - 版本快照摘要。
 */
public record ApiStudioEndpointVersionItem(
        Long id,
        Long endpointId,
        Integer versionNo,
        String changeType,
        String changeSummary,
        Long creatorUserId,
        LocalDateTime createdAt,
        String snapshotJson
) {
}
