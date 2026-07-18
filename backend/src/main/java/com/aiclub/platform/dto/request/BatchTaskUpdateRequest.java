package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * 工作项批量字段更新请求。
 * 字段类型显式区分空负责人、未规划迭代等合法空值，避免稀疏 JSON 载荷产生歧义。
 */
public record BatchTaskUpdateRequest(
        @NotEmpty(message = "工作项不能为空")
        @Size(max = 20, message = "一次最多操作20个工作项")
        List<@NotNull(message = "工作项ID不能为空") Long> taskIds,
        @NotNull(message = "批量更新字段不能为空")
        Field field,
        String value,
        Long assigneeUserId,
        Long iterationId
) {
    /** 当前公众端批量栏允许修改的安全字段。 */
    public enum Field {
        STATUS,
        PRIORITY,
        ASSIGNEE,
        ITERATION
    }
}
