package com.aiclub.platform.dto;

import com.aiclub.platform.runtime.RuntimeHealthStatus;

import java.util.List;

/**
 * 公众端聊天 Runtime 选项。
 * 业务意图：只返回选择和诊断所需字段，不把 endpoint、沙箱策略等注册管理信息暴露给聊天室成员。
 */
public record RuntimeChatOptionSummary(
        String runtimeCode,
        String version,
        List<String> capabilities,
        RuntimeHealthStatus healthStatus,
        String healthMessage,
        boolean enabled
) {
    public RuntimeChatOptionSummary {
        capabilities = capabilities == null ? List.of() : List.copyOf(capabilities);
        healthMessage = healthMessage == null ? "" : healthMessage;
    }
}
