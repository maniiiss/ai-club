package com.aiclub.platform.dto.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * 首页快捷入口整组保存请求。
 */
public record SaveDashboardShortcutEntriesRequest(
        /** 当前范围下最新的入口列表顺序。 */
        @NotNull(message = "快捷入口列表不能为空")
        @Size(max = 20, message = "快捷入口数量不能超过20")
        List<@Valid SaveDashboardShortcutEntryItemRequest> items
) {
}
