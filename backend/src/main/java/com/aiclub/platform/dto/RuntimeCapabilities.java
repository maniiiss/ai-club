package com.aiclub.platform.dto;

/**
 * 前端运行时能力开关摘要。
 * 用于在不重新登录的情况下即时感知高风险模块是否已被后台停用。
 */
public record RuntimeCapabilities(
        boolean serverManagementEnabled
) {
}
