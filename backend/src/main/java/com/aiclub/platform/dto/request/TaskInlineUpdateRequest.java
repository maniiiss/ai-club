package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotNull;

/**
 * 工作项列表轻量更新请求。
 * 业务意图：列表快捷编辑只提交实际变化的字段，避免把描述、需求文档等大字段重复传输。
 */
public record TaskInlineUpdateRequest(
        @NotNull(message = "列表更新字段不能为空")
        Field field,
        String value,
        Long assigneeUserId,
        String planStartDate,
        String planEndDate
) {
    /** 列表当前允许快捷修改的字段。 */
    public enum Field {
        STATUS,
        PRIORITY,
        ASSIGNEE,
        PLAN_DATES
    }
}
