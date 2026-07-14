package com.aiclub.platform.dto;

import com.aiclub.platform.runtime.RuntimeAdapterType;
import com.aiclub.platform.runtime.RuntimeHealthStatus;

import java.time.LocalDateTime;
import java.util.List;

/** Runtime 注册项摘要，供 Agent 管理和 Runtime 管理页面使用。 */
public record RuntimeRegistrySummary(
        String runtimeCode,
        RuntimeAdapterType adapterType,
        String endpointRef,
        String version,
        List<String> capabilities,
        String sandboxPolicyJson,
        List<String> fallbackRuntimeCodes,
        RuntimeHealthStatus healthStatus,
        String healthMessage,
        LocalDateTime healthCheckedAt,
        boolean enabled
) {
}
