package com.aiclub.platform.runtime;

/** Runtime 启动后的平台侧句柄。 */
public record RuntimeRunHandle(String runId, String sessionId, RuntimeHealthStatus status) {
}
