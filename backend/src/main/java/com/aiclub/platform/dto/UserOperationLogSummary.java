package com.aiclub.platform.dto;

/**
 * 操作日志列表与详情共用的轻量摘要对象。
 */
public record UserOperationLogSummary(
        Long id,
        Long userId,
        String usernameSnapshot,
        String nicknameSnapshot,
        String moduleCode,
        String moduleName,
        String actionCode,
        String actionName,
        String bizType,
        Long bizId,
        String httpMethod,
        String requestUri,
        String routePattern,
        String permissionCode,
        String operationStatus,
        Integer responseStatus,
        Long durationMs,
        String ipAddress,
        String userAgent,
        String requestSnapshot,
        String resultMessage,
        String createdAt
) {
}
