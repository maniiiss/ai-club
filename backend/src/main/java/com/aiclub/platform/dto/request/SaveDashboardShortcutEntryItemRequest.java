package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 首页快捷入口保存请求里的单条项目。
 */
public record SaveDashboardShortcutEntryItemRequest(
        /** 已存在入口ID；新增时传空。 */
        Long id,
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
        Boolean enabled
) {
}
