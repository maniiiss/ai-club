package com.aiclub.platform.runtime;

import java.time.LocalDateTime;

/** Runtime 健康探测结果，供注册中心和执行前置校验复用。 */
public record RuntimeHealth(
        String runtimeCode,
        RuntimeHealthStatus status,
        String message,
        LocalDateTime checkedAt
) {
    public static RuntimeHealth unknown(String runtimeCode, String message) {
        return new RuntimeHealth(runtimeCode, RuntimeHealthStatus.UNKNOWN, message, LocalDateTime.now());
    }
}
