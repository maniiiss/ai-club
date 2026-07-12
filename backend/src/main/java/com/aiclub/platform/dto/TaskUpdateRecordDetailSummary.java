package com.aiclub.platform.dto;

/** 工作项更新记录的字段或动作明细。 */
public record TaskUpdateRecordDetailSummary(
        Long id,
        String fieldCode,
        String fieldName,
        String detailType,
        String oldValue,
        String newValue,
        Long relatedObjectId,
        String relatedObjectName
) {
}
