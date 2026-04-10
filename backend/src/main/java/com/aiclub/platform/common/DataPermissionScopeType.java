package com.aiclub.platform.common;

/**
 * 角色可配置的数据权限范围枚举。
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
     */
    PROJECT_PARTICIPANT,

    /**
     * 所有人都命中。
     */
    ALL
}
