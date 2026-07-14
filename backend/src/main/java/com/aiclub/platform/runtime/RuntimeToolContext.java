package com.aiclub.platform.runtime;

import java.util.List;

/**
 * AgentRuntime 工具调用契约 v1。
 * 业务意图：所有 Runtime 接收相同的工具目录和授权语义，具体 Runtime 只负责转换成自己的原生 tool calling 形式。
 */
public record RuntimeToolContext(
        String contractVersion,
        List<RuntimeToolDefinition> tools,
        RuntimeToolPolicy policy
) {
    public RuntimeToolContext {
        contractVersion = contractVersion == null || contractVersion.isBlank() ? "v1" : contractVersion.trim();
        tools = tools == null ? List.of() : List.copyOf(tools);
        policy = policy == null ? RuntimeToolPolicy.empty() : policy;
    }

    public static RuntimeToolContext empty() {
        return new RuntimeToolContext("v1", List.of(), RuntimeToolPolicy.empty());
    }
}
