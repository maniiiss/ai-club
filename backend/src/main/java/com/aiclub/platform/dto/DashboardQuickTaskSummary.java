package com.aiclub.platform.dto;

/**
 * 返回给首页快捷任务组件的单条数据。
 */
public record DashboardQuickTaskSummary(
        /**
         * 快捷任务主键ID。
         */
        Long id,
        /**
         * 前端用于匹配本地草稿项的临时键。
         */
        String clientKey,
        /**
         * 快捷任务正文内容。
         */
        String content,
        /**
         * 是否已勾选完成。
         */
        boolean checked,
        /**
         * 当前展示顺序。
         */
        Integer sortOrder
) {
}
