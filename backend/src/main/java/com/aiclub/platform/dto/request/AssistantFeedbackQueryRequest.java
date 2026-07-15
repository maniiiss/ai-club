package com.aiclub.platform.dto.request;

/** 管理端反馈列表筛选参数的内部载荷。 */
public record AssistantFeedbackQueryRequest(
        String keyword,
        String vote,
        String status,
        String datasetStatus,
        Long projectId,
        Long assigneeUserId
) {
}
