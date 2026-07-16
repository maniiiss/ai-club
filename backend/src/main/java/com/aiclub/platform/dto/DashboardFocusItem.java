package com.aiclub.platform.dto;

/**
 * 公众端定位化工作台的单条关注事项。
 * 业务意图：后端仅返回当前用户已有权限的数据和定位后的优先级，前端据此统一展示并跳转。
 */
public record DashboardFocusItem(
        String category,
        String title,
        String description,
        String severity,
        String status,
        Long projectId,
        Long workItemId,
        String externalUrl
) {
}
