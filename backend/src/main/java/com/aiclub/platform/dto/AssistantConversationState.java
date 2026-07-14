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
        AssistantToolExecutionPolicy toolExecutionPolicy
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
                AssistantToolExecutionPolicy.empty());
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
    }
}
