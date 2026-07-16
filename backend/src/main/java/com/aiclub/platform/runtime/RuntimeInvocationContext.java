package com.aiclub.platform.runtime;

import java.util.List;
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
        RuntimeContextProfile contextProfile,
        List<RuntimeConversationMessage> conversationHistory
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
                RuntimeContextProfile.defaults(), List.of());
    }

    /**
     * 兼容已显式传入 Runtime 上下文预算的调用方，默认不附带会话历史。
     */
    public RuntimeInvocationContext(String runId,
                                    String sessionId,
                                    String input,
                                    String systemPrompt,
                                    Map<String, Object> variables,
                                    Map<String, Object> profileSnapshot,
                                    RuntimeToolContext toolContext,
                                    RuntimeContextProfile contextProfile) {
        this(runId, sessionId, input, systemPrompt, variables, profileSnapshot, toolContext,
                contextProfile, List.of());
    }

    public RuntimeInvocationContext {
        variables = variables == null ? Map.of() : Map.copyOf(variables);
        profileSnapshot = profileSnapshot == null ? Map.of() : Map.copyOf(profileSnapshot);
        toolContext = toolContext == null ? RuntimeToolContext.empty() : toolContext;
        contextProfile = contextProfile == null ? RuntimeContextProfile.defaults() : contextProfile;
        conversationHistory = conversationHistory == null ? List.of() : List.copyOf(conversationHistory);
    }

    /** 为同一次 Runtime 调用附加统一工具契约，保留原有不可变上下文。 */
    public RuntimeInvocationContext withToolContext(RuntimeToolContext nextToolContext) {
        return new RuntimeInvocationContext(runId, sessionId, input, systemPrompt, variables, profileSnapshot,
                nextToolContext, contextProfile, conversationHistory);
    }

    /**
     * 为 Runtime 调用附加平台规范的历史对话，具体适配器负责转换为各自 SDK 所需格式。
     */
    public RuntimeInvocationContext withConversationHistory(List<RuntimeConversationMessage> nextConversationHistory) {
        return new RuntimeInvocationContext(runId, sessionId, input, systemPrompt, variables, profileSnapshot,
                toolContext, contextProfile, nextConversationHistory);
    }
}
