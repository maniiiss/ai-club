package com.aiclub.platform.dto;

import java.util.List;

/**
 * 首页“常用系统访问入口”组件聚合数据。
 */
public record DashboardShortcutOverview(
        /** 管理员统一维护的系统入口。 */
        List<DashboardShortcutEntrySummary> systemEntries,
        /** 当前登录用户自己的入口。 */
        List<DashboardShortcutEntrySummary> userEntries
) {
}
