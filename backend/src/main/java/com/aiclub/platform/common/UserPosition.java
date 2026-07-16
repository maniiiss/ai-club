package com.aiclub.platform.common;

/**
 * 用户在研发协作中的主定位。
 * 业务意图：定位只用于组织公众端首页的信息优先级，不参与角色授权或数据权限判定。
 */
public enum UserPosition {
    PROJECT_MANAGER,
    PRODUCT,
    UI_DESIGNER,
    DEVELOPER,
    TECHNICAL_MANAGER
}
