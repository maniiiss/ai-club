package com.aiclub.platform.runtime;

import java.util.Map;

/** 一次 Runtime 调用的不可变上下文，避免适配器自行拼接用户身份和业务参数。 */
public record RuntimeInvocationContext(
        String runId,
        String sessionId,
        String input,
        String systemPrompt,
        Map<String, Object> variables,
        Map<String, Object> profileSnapshot,
        RuntimeToolContext toolContext,
        RuntimeContextProfile contextProfile
) {
    /** 兼容旧 Runtime 调用方，未提供工具契约时使用空目录。 */
    public RuntimeInvocationContext(String runId,
                                    String sessionId,
                                    String input,
                                    String systemPrompt,
                                    Map<String, Object> variables,
                                    Map<String, Object> profileSnapshot) {
        this(runId, sessionId, input, systemPrompt, variables, profileSnapshot, RuntimeToolContext.empty());
    }

    /** 兼容已有 Runtime 调用方，未显式提供上下文预算时使用平台默认值。 */
    public RuntimeInvocationContext(String runId,
                                    String sessionId,
                                    String input,
                                    String systemPrompt,
                                    Map<String, Object> variables,
                                    Map<String, Object> profileSnapshot,
                                    RuntimeToolContext toolContext) {
        this(runId, sessionId, input, systemPrompt, variables, profileSnapshot, toolContext,
                RuntimeContextProfile.defaults());
    }

    public RuntimeInvocationContext {
        variables = variables == null ? Map.of() : Map.copyOf(variables);
        profileSnapshot = profileSnapshot == null ? Map.of() : Map.copyOf(profileSnapshot);
        toolContext = toolContext == null ? RuntimeToolContext.empty() : toolContext;
        contextProfile = contextProfile == null ? RuntimeContextProfile.defaults() : contextProfile;
    }

    /** 为同一次 Runtime 调用附加统一工具契约，保留原有不可变上下文。 */
    public RuntimeInvocationContext withToolContext(RuntimeToolContext nextToolContext) {
        return new RuntimeInvocationContext(runId, sessionId, input, systemPrompt, variables, profileSnapshot,
                nextToolContext, contextProfile);
    }
}
