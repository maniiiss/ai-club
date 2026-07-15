package com.aiclub.platform.dto;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Assistant 会话在 Redis 中保存的完整状态。
 * 它既服务前端续聊，也服务内部 MCP 工具执行链路恢复上下文。
 */
public record AssistantConversationState(
        String scopeKey,
        String clientConversationId,
        CurrentUserInfo currentUser,
        AssistantConversationContextSnapshot context,
        AssistantConversationRequestSnapshot currentRequest,
        String mcpSessionToken,
        List<AssistantConversationTurn> transcript,
        List<AssistantReferenceSummary> references,
        List<String> suggestions,
        List<AssistantActionSummary> actions,
        List<AssistantSelectionCard> selectionCards,
        AssistantGroundingState groundingState,
        List<Map<String, Object>> toolExecutions,
        String lastErrorMessage,
        AssistantToolExecutionPolicy toolExecutionPolicy,
        AssistantConversationContextState contextState
) {
    public AssistantConversationState(String scopeKey,
                                   String clientConversationId,
                                   CurrentUserInfo currentUser,
                                   AssistantConversationContextSnapshot context,
                                   AssistantConversationRequestSnapshot currentRequest,
                                   String mcpSessionToken,
                                   List<AssistantConversationTurn> transcript,
                                   List<AssistantReferenceSummary> references,
                                   List<String> suggestions,
                                   List<AssistantActionSummary> actions,
                                   List<AssistantSelectionCard> selectionCards,
                                   AssistantGroundingState groundingState,
                                   List<Map<String, Object>> toolExecutions,
                                   String lastErrorMessage) {
        this(scopeKey, clientConversationId, currentUser, context, currentRequest, mcpSessionToken, transcript,
                references, suggestions, actions, selectionCards, groundingState, toolExecutions, lastErrorMessage,
                AssistantToolExecutionPolicy.empty(), AssistantConversationContextState.empty());
    }

    /** 兼容已经使用工具执行策略的旧调用方。 */
    public AssistantConversationState(String scopeKey,
                                   String clientConversationId,
                                   CurrentUserInfo currentUser,
                                   AssistantConversationContextSnapshot context,
                                   AssistantConversationRequestSnapshot currentRequest,
                                   String mcpSessionToken,
                                   List<AssistantConversationTurn> transcript,
                                   List<AssistantReferenceSummary> references,
                                   List<String> suggestions,
                                   List<AssistantActionSummary> actions,
                                   List<AssistantSelectionCard> selectionCards,
                                   AssistantGroundingState groundingState,
                                   List<Map<String, Object>> toolExecutions,
                                   String lastErrorMessage,
                                   AssistantToolExecutionPolicy toolExecutionPolicy) {
        this(scopeKey, clientConversationId, currentUser, context, currentRequest, mcpSessionToken, transcript,
                references, suggestions, actions, selectionCards, groundingState, toolExecutions, lastErrorMessage,
                toolExecutionPolicy, AssistantConversationContextState.empty());
    }

    public AssistantConversationState {
        scopeKey = scopeKey == null ? "" : scopeKey.trim();
        clientConversationId = clientConversationId == null ? "" : clientConversationId.trim();
        mcpSessionToken = mcpSessionToken == null ? "" : mcpSessionToken.trim();
        transcript = transcript == null ? List.of() : List.copyOf(transcript);
        references = references == null ? List.of() : List.copyOf(references);
        suggestions = suggestions == null ? List.of() : List.copyOf(suggestions);
        actions = actions == null ? List.of() : List.copyOf(actions);
        selectionCards = selectionCards == null ? List.of() : List.copyOf(selectionCards);
        groundingState = groundingState == null ? AssistantGroundingState.empty() : groundingState;
        toolExecutions = toolExecutions == null
                ? List.of()
                : toolExecutions.stream()
                .map(item -> item == null ? Map.<String, Object>of() : Map.copyOf(new LinkedHashMap<>(item)))
                .toList();
        lastErrorMessage = lastErrorMessage == null ? "" : lastErrorMessage.trim();
        toolExecutionPolicy = toolExecutionPolicy == null ? AssistantToolExecutionPolicy.empty() : toolExecutionPolicy;
        contextState = contextState == null ? AssistantConversationContextState.empty() : contextState;
    }

    /** 更新长对话摘要和结构化事实，保留其余运行时状态不变。 */
    public AssistantConversationState withContextState(AssistantConversationContextState nextContextState) {
        return new AssistantConversationState(scopeKey, clientConversationId, currentUser, context, currentRequest,
                mcpSessionToken, transcript, references, suggestions, actions, selectionCards, groundingState,
                toolExecutions, lastErrorMessage, toolExecutionPolicy, nextContextState);
    }
}
