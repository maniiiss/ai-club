package com.aiclub.platform.dto;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Hermes 会话在 Redis 中保存的完整状态。
 * 它既服务前端续聊，也服务内部 MCP 工具执行链路恢复上下文。
 */
public record HermesConversationState(
        String scopeKey,
        String clientConversationId,
        CurrentUserInfo currentUser,
        HermesConversationContextSnapshot context,
        HermesConversationRequestSnapshot currentRequest,
        String mcpSessionToken,
        List<HermesConversationTurn> transcript,
        List<HermesReferenceSummary> references,
        List<String> suggestions,
        List<HermesActionSummary> actions,
        List<HermesSelectionCard> selectionCards,
        HermesGroundingState groundingState,
        List<Map<String, Object>> toolExecutions,
        String lastErrorMessage,
        HermesToolExecutionPolicy toolExecutionPolicy
) {
    public HermesConversationState(String scopeKey,
                                   String clientConversationId,
                                   CurrentUserInfo currentUser,
                                   HermesConversationContextSnapshot context,
                                   HermesConversationRequestSnapshot currentRequest,
                                   String mcpSessionToken,
                                   List<HermesConversationTurn> transcript,
                                   List<HermesReferenceSummary> references,
                                   List<String> suggestions,
                                   List<HermesActionSummary> actions,
                                   List<HermesSelectionCard> selectionCards,
                                   HermesGroundingState groundingState,
                                   List<Map<String, Object>> toolExecutions,
                                   String lastErrorMessage) {
        this(scopeKey, clientConversationId, currentUser, context, currentRequest, mcpSessionToken, transcript,
                references, suggestions, actions, selectionCards, groundingState, toolExecutions, lastErrorMessage,
                HermesToolExecutionPolicy.empty());
    }

    public HermesConversationState {
        scopeKey = scopeKey == null ? "" : scopeKey.trim();
        clientConversationId = clientConversationId == null ? "" : clientConversationId.trim();
        mcpSessionToken = mcpSessionToken == null ? "" : mcpSessionToken.trim();
        transcript = transcript == null ? List.of() : List.copyOf(transcript);
        references = references == null ? List.of() : List.copyOf(references);
        suggestions = suggestions == null ? List.of() : List.copyOf(suggestions);
        actions = actions == null ? List.of() : List.copyOf(actions);
        selectionCards = selectionCards == null ? List.of() : List.copyOf(selectionCards);
        groundingState = groundingState == null ? HermesGroundingState.empty() : groundingState;
        toolExecutions = toolExecutions == null
                ? List.of()
                : toolExecutions.stream()
                .map(item -> item == null ? Map.<String, Object>of() : Map.copyOf(new LinkedHashMap<>(item)))
                .toList();
        lastErrorMessage = lastErrorMessage == null ? "" : lastErrorMessage.trim();
        toolExecutionPolicy = toolExecutionPolicy == null ? HermesToolExecutionPolicy.empty() : toolExecutionPolicy;
    }
}
