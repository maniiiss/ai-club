package com.aiclub.platform.runtime;

import java.util.Map;

/** 一次 Runtime 调用的不可变上下文，避免适配器自行拼接用户身份和业务参数。 */
public record RuntimeInvocationContext(
        String runId,
        String sessionId,
        String input,
        String systemPrompt,
        Map<String, Object> variables,
        Map<String, Object> profileSnapshot
) {
    public RuntimeInvocationContext {
        variables = variables == null ? Map.of() : Map.copyOf(variables);
        profileSnapshot = profileSnapshot == null ? Map.of() : Map.copyOf(profileSnapshot);
    }
}
