package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * 系统级快捷入口新增与编辑请求。
 */
public record DashboardShortcutAdminRequest(
        /** 入口名称。 */
        @NotBlank(message = "快捷入口名称不能为空")
        @Size(max = 120, message = "快捷入口名称长度不能超过120")
        String name,
        /** 跳转地址。 */
        @NotBlank(message = "快捷入口链接地址不能为空")
        @Size(max = 500, message = "快捷入口链接地址长度不能超过500")
        String url,
        /** 图标名称。 */
        @Size(max = 500, message = "快捷入口图标长度不能超过500")
        String icon,
        /** 是否启用。 */
        @NotNull(message = "启用状态不能为空")
        Boolean enabled,
        /** 展示顺序。 */
        @NotNull(message = "排序值不能为空")
        Integer sortOrder
) {
}
