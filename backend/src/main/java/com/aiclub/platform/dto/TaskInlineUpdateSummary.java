package com.aiclub.platform.dto;

/**
 * 工作项列表轻量更新结果。
 * 业务意图：预留给列表局部更新使用，不携带描述和需求文档等大字段。
 */
public record TaskInlineUpdateSummary(
        Long id,
        String status,
        String priority,
        String assignee,
        Long assigneeUserId,
        String planStartDate,
        String planEndDate,
        String updatedAt
) {
}
