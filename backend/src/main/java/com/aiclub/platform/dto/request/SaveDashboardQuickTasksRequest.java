package com.aiclub.platform.dto.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * 首页快捷任务整组保存请求。
 */
public record SaveDashboardQuickTasksRequest(
        /**
         * 当前用户最新的快捷任务列表顺序。
         */
        @NotNull(message = "快捷任务列表不能为空")
        @Size(max = 20, message = "快捷任务数量不能超过20")
        List<@Valid SaveDashboardQuickTaskItemRequest> items
) {
}
