package com.aiclub.platform.dto;

import java.util.List;

/** 工作项更新记录时间线节点。 */
public record TaskUpdateRecordSummary(
        Long id,
        Long taskId,
        Long operatorUserId,
        String operatorName,
        String source,
        String actionType,
        String summary,
        String createdAt,
        List<TaskUpdateRecordDetailSummary> details
) {
}
