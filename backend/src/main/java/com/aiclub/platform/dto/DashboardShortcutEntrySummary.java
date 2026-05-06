package com.aiclub.platform.dto;

/**
 * 首页快捷入口摘要。
 */
public record DashboardShortcutEntrySummary(
        /** 入口主键ID。 */
        Long id,
        /** 归属范围：SYSTEM / USER。 */
        String scopeType,
        /** 入口名称。 */
        String name,
        /** 跳转地址。 */
        String url,
        /** 图标名称。 */
        String icon,
        /** 是否启用。 */
        boolean enabled,
        /** 展示顺序。 */
        Integer sortOrder
) {
}
