package com.aiclub.platform.common;

/**
 * 角色可配置的数据权限范围枚举。
 * 项目绑定能力默认复用这套范围，不再为智能体、执行中心、GitLab、CI/CD 等模块额外扩展数据权限字段。
 */
public enum DataPermissionScopeType {

    /**
     * 不授予任何数据权限。
     */
    NONE,

    /**
     * 仅项目负责人命中。
     */
    OWNER_ONLY,

    /**
     * 仅资源创建人命中。
     */
    CREATOR_ONLY,

    /**
     * 项目负责人或资源创建人命中。
     */
    OWNER_OR_CREATOR,

    /**
     * 项目参与人命中，包含负责人、项目创建人和项目成员。
     * 前端展示上统一称为“项目成员（含负责人/创建人）”，降低权限配置歧义。
     */
    PROJECT_PARTICIPANT,

    /**
     * 所有人都命中。
     */
    ALL
}
