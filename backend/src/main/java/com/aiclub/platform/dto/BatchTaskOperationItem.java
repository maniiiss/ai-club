package com.aiclub.platform.dto;

/**
 * 单个工作项在批量操作中的结果。
 * 成功时 task 有值，失败时 errorMessage 有值；让客户端准确保留失败项的选择状态。
 */
public record BatchTaskOperationItem(
        Long taskId,
        TaskSummary task,
        String errorMessage
) {
}
