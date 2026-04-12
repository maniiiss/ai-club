package com.aiclub.platform.dto;

/**
 * 平台工具列表项。
 * 列表页同时展示代码注册定义和数据库覆盖后的配置结果。
 */
public record PlatformToolSummary(
        /**
         * 工具编码。
         */
        String code,
        /**
         * 当前生效展示名称。
         */
        String name,
        /**
         * 工具所属模块。
         */
        String moduleCode,
        /**
         * 当前生效描述。
         */
        String description,
        /**
         * 是否只读。
         */
        boolean readOnly,
        /**
         * 风险等级。
         */
        String riskLevel,
        /**
         * 关联权限码。
         */
        String permissionCode,
        /**
         * 工具定义层默认是否需要确认。
         */
        boolean requiresConfirm,
        /**
         * 当前是否启用。
         */
        boolean enabled,
        /**
         * 是否允许自动执行。
         */
        boolean allowAutoExecute,
        /**
         * 数据库中的展示名称覆盖值。
         */
        String displayNameOverride,
        /**
         * 数据库中的描述覆盖值。
         */
        String descriptionOverride
) {
}
