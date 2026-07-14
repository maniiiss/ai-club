package com.aiclub.platform.runtime;

import java.util.List;

/**
 * AgentRuntime 通用工具授权策略。
 * 业务意图：Runtime 只获得本轮允许看见的工具和短期会话令牌，最终权限与审计仍由 backend 工具网关复核。
 */
public record RuntimeToolPolicy(
        String sessionToken,
        List<String> allowedToolCodes,
        List<String> autoExecuteToolCodes
) {
    public RuntimeToolPolicy {
        sessionToken = sessionToken == null ? "" : sessionToken.trim();
        allowedToolCodes = allowedToolCodes == null ? List.of() : List.copyOf(allowedToolCodes);
        autoExecuteToolCodes = autoExecuteToolCodes == null ? List.of() : List.copyOf(autoExecuteToolCodes);
    }

    public static RuntimeToolPolicy empty() {
        return new RuntimeToolPolicy("", List.of(), List.of());
    }
}
