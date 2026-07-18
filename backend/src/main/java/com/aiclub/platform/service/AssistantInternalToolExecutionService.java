package com.aiclub.platform.service;

import com.aiclub.platform.dto.CurrentUserInfo;
import com.aiclub.platform.dto.AssistantConversationState;
import com.aiclub.platform.dto.AssistantGroundingState;
import com.aiclub.platform.dto.AssistantActionSummary;
import com.aiclub.platform.dto.AssistantMcpToolSummary;
import com.aiclub.platform.dto.AssistantInternalToolExecuteResponse;
import com.aiclub.platform.dto.AssistantReferenceSummary;
import com.aiclub.platform.dto.AssistantToolCallRequest;
import com.aiclub.platform.dto.AssistantToolExecutionOutcome;
import com.aiclub.platform.dto.PlatformToolCandidate;
import com.aiclub.platform.dto.PlatformToolDefinition;
import com.aiclub.platform.dto.PlatformToolResult;
import com.aiclub.platform.dto.request.AssistantChatRequest;
import com.aiclub.platform.dto.request.AssistantInternalToolExecuteRequest;
import com.aiclub.platform.exception.ForbiddenException;
import com.aiclub.platform.exception.UnauthorizedException;
import com.aiclub.platform.security.AuthContext;
import com.aiclub.platform.security.AuthContextHolder;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/**
 * 处理 Python MCP bridge 转发过来的平台工具调用。
 * 该服务负责恢复用户权限上下文、执行工具、更新 Redis 会话态，并返回给 MCP 的简短文本摘要。
 */
@Service
public class AssistantInternalToolExecutionService {

    private static final int MAX_REFERENCE_COUNT = 12;
    private static final int MAX_TOOL_EXECUTION_LOGS = 20;

    private final AssistantConversationStateStore assistantConversationStateStore;
    private final AssistantMcpSessionTokenService assistantMcpSessionTokenService;
    private final AssistantToolOrchestrator assistantToolOrchestrator;
    private final AssistantFallbackAnswerService assistantFallbackAnswerService;
    private final PlatformToolRegistry platformToolRegistry;
    private final AssistantMcpServerService assistantMcpServerService;

    public AssistantInternalToolExecutionService(AssistantConversationStateStore assistantConversationStateStore,
                                              AssistantMcpSessionTokenService assistantMcpSessionTokenService,
                                              AssistantToolOrchestrator assistantToolOrchestrator,
                                              AssistantFallbackAnswerService assistantFallbackAnswerService,
                                              PlatformToolRegistry platformToolRegistry,
                                              AssistantMcpServerService assistantMcpServerService) {
        this.assistantConversationStateStore = assistantConversationStateStore;
        this.assistantMcpSessionTokenService = assistantMcpSessionTokenService;
        this.assistantToolOrchestrator = assistantToolOrchestrator;
        this.assistantFallbackAnswerService = assistantFallbackAnswerService;
        this.platformToolRegistry = platformToolRegistry;
        this.assistantMcpServerService = assistantMcpServerService;
    }

    /**
     * 执行内部工具请求，并把最新结果写回 Redis 会话态。
     */
    public AssistantInternalToolExecuteResponse execute(AssistantInternalToolExecuteRequest request) {
        AssistantMcpSessionTokenService.AssistantMcpSessionClaims claims = assistantMcpSessionTokenService.parseToken(request.sessionToken());
        AssistantConversationState state = assistantConversationStateStore.load(claims.scopeKey(), claims.conversationId())
                .orElseThrow(() -> new UnauthorizedException("Assistant 会话态已失效，请重新发起提问"));
        validateStateOwnership(state, claims);

        String toolCode = normalizeToolCode(request.toolCode());
        // 业务意图：候选卡片一旦生成就必须等待用户点击确认，不能让模型后续的补充工具调用把卡片覆盖为空。
        // 用户点击卡片会以新的 selection 请求进入 prepareConversation，并在进入这里前清理旧卡片。
        if (!state.selectionCards().isEmpty()) {
            return new AssistantInternalToolExecuteResponse(
                    assistantFallbackAnswerService.composeSelectionSummary(state.selectionCards())
            );
        }
        if (assistantMcpServerService != null && assistantMcpServerService.isExternalToolCode(toolCode)) {
            String slashCommand = state.currentRequest() == null ? "" : state.currentRequest().slashCommand();
            if (!assistantMcpServerService.isToolAllowedForSlashCommand(toolCode, slashCommand)) {
                throw new ForbiddenException("当前专项 MCP 未授权调用该外部工具");
            }
            Map<String, Object> arguments = sanitizeArguments(request.arguments());
            AssistantMcpToolSummary externalTool = assistantMcpServerService.findExternalTool(state.currentUser().id(), toolCode);
            if (externalTool.requiresConfirm()) {
                AssistantActionSummary action = new AssistantActionSummary(
                        "EXTERNAL_MCP_TOOL",
                        "确认执行外部 MCP 工具：" + externalTool.name(),
                        externalTool.description().isBlank() ? "该工具不是明确只读工具，执行前需要用户确认。" : externalTool.description(),
                        true,
                        Map.of("toolCode", toolCode, "arguments", arguments,
                                "scopeKey", state.scopeKey(),
                                "clientConversationId", state.clientConversationId(),
                                "confirmationToken", UUID.randomUUID().toString()));
                assistantConversationStateStore.save(new AssistantConversationState(
                        state.scopeKey(), state.clientConversationId(), state.currentUser(), state.context(), state.currentRequest(),
                        state.mcpSessionToken(), state.transcript(), state.references(), state.suggestions(), List.of(action),
                        state.selectionCards(), state.groundingState(), state.toolExecutions(), "", state.toolExecutionPolicy(), state.contextState()));
                return new AssistantInternalToolExecuteResponse("外部 MCP 工具需要用户确认后执行：" + externalTool.name());
            }
            String result = assistantMcpServerService.executeExternalTool(state.currentUser().id(), toolCode, arguments);
            return new AssistantInternalToolExecuteResponse(result);
        }
        PlatformToolDefinition definition = platformToolRegistry.requireDefinition(toolCode);
        if (definition.readOnly() && !platformToolRegistry.isAllowAutoExecute(toolCode)) {
            throw new ForbiddenException("当前工具未开启自动执行：" + toolCode);
        }

        AssistantToolCallRequest toolCall = new AssistantToolCallRequest(
                buildToolCallId(toolCode),
                toolCode,
                toolCode.replace(".", "__"),
                sanitizeArguments(request.arguments())
        );

        AssistantToolExecutionOutcome outcome;
        AuthContextHolder.set(toAuthContext(state.currentUser()));
        try {
            outcome = assistantToolOrchestrator.executeToolCall(
                    toolCall,
                    state.scopeKey(),
                    state.context().toContext(),
                    restoreCurrentRequest(state),
                    state.groundingState() == null ? AssistantGroundingState.empty() : state.groundingState(),
                    state.toolExecutionPolicy()
            );
        } finally {
            AuthContextHolder.clear();
        }

        AssistantConversationState nextState = new AssistantConversationState(
                state.scopeKey(),
                state.clientConversationId(),
                state.currentUser(),
                state.context(),
                state.currentRequest(),
                state.mcpSessionToken(),
                state.transcript(),
                mergeReferences(state.context().references(), state.references(), deriveReferences(outcome.toolResults())),
                state.suggestions(),
                outcome.actions(),
                outcome.selectionCards(),
                outcome.groundingState(),
                mergeToolExecutions(state.toolExecutions(), outcome.debugExecution(), toolCode),
                "failed".equalsIgnoreCase(defaultString(outcome.stopReason()))
                        ? resolveToolMessage(outcome)
                        : "",
                state.toolExecutionPolicy(),
                state.contextState()
        );
        assistantConversationStateStore.save(nextState);
        return new AssistantInternalToolExecuteResponse(resolveToolMessage(outcome));
    }

    /**
     * 将工具执行结果转换为返回给 Assistant 的文本。
     * 这里优先使用平台已经整理好的本地总结，避免模型读到不完整状态。
     */
    private String resolveToolMessage(AssistantToolExecutionOutcome outcome) {
        if (outcome == null) {
            return "平台工具执行失败，当前没有可用结果。";
        }
        if (outcome.stopLoop()) {
            return switch (defaultString(outcome.stopReason())) {
                case "awaiting_selection" -> defaultString(outcome.localSummary()).isBlank()
                        ? assistantFallbackAnswerService.composeSelectionSummary(outcome.selectionCards())
                        : outcome.localSummary();
                case "awaiting_confirmation" -> defaultString(outcome.localSummary()).isBlank()
                        ? assistantFallbackAnswerService.composeActionSummary(outcome.actions())
                        : outcome.localSummary();
                default -> assistantFallbackAnswerService.composeFailureSummary(outcome.localSummary());
            };
        }
        if (!defaultString(outcome.toolMessageContent()).isBlank()) {
            return outcome.toolMessageContent();
        }
        return assistantFallbackAnswerService.composeFailureSummary("平台工具执行完成，但没有返回可展示的内容。");
    }

    /**
     * 将工具候选对象整理成前端引用来源，便于回答完成后继续跳转。
     */
    private List<AssistantReferenceSummary> deriveReferences(List<PlatformToolResult> toolResults) {
        if (toolResults == null || toolResults.isEmpty()) {
            return List.of();
        }
        List<AssistantReferenceSummary> references = new ArrayList<>();
        for (PlatformToolResult toolResult : toolResults) {
            if (toolResult == null || toolResult.candidates() == null) {
                continue;
            }
            for (PlatformToolCandidate candidate : toolResult.candidates().stream().limit(3).toList()) {
                if (candidate == null || candidate.id() == null || defaultString(candidate.route()).isBlank()) {
                    continue;
                }
                references.add(new AssistantReferenceSummary(
                        defaultString(candidate.type()),
                        candidate.id(),
                        defaultString(candidate.title()),
                        defaultString(candidate.route())
                ));
            }
        }
        return references;
    }

    /**
     * 合并上下文引用、旧引用和本轮新增引用，避免同一对象重复出现。
     */
    private List<AssistantReferenceSummary> mergeReferences(List<AssistantReferenceSummary> baseReferences,
                                                         List<AssistantReferenceSummary> existingReferences,
                                                         List<AssistantReferenceSummary> newReferences) {
        LinkedHashMap<String, AssistantReferenceSummary> merged = new LinkedHashMap<>();
        appendReferences(merged, baseReferences);
        appendReferences(merged, existingReferences);
        appendReferences(merged, newReferences);
        return merged.values().stream().limit(MAX_REFERENCE_COUNT).toList();
    }

    private void appendReferences(Map<String, AssistantReferenceSummary> target, List<AssistantReferenceSummary> references) {
        if (references == null) {
            return;
        }
        for (AssistantReferenceSummary reference : references) {
            if (reference == null) {
                continue;
            }
            String key = defaultString(reference.type()) + ":" + reference.id() + ":" + defaultString(reference.route());
            target.putIfAbsent(key, reference);
        }
    }

    /**
     * 追加本轮工具执行轨迹，供调试模式查看。
     */
    private List<Map<String, Object>> mergeToolExecutions(List<Map<String, Object>> existingLogs,
                                                          Map<String, Object> latestLog,
                                                          String toolCode) {
        List<Map<String, Object>> merged = new ArrayList<>();
        if (existingLogs != null) {
            merged.addAll(existingLogs);
        }
        if (latestLog != null && !latestLog.isEmpty()) {
            LinkedHashMap<String, Object> normalized = new LinkedHashMap<>(latestLog);
            normalized.putIfAbsent("toolCode", toolCode);
            merged.add(Map.copyOf(normalized));
        }
        if (merged.size() <= MAX_TOOL_EXECUTION_LOGS) {
            return List.copyOf(merged);
        }
        return List.copyOf(merged.subList(merged.size() - MAX_TOOL_EXECUTION_LOGS, merged.size()));
    }

    /**
     * 根据 Redis 中保存的用户快照恢复当前线程的权限上下文。
     */
    private AuthContext toAuthContext(CurrentUserInfo currentUser) {
        if (currentUser == null || currentUser.id() == null) {
            throw new UnauthorizedException("Assistant 会话中的用户快照缺失");
        }
        Set<String> roleCodes = new LinkedHashSet<>(currentUser.roleCodes() == null ? List.of() : currentUser.roleCodes());
        Set<String> permissionCodes = new LinkedHashSet<>(currentUser.permissionCodes() == null ? List.of() : currentUser.permissionCodes());
        return new AuthContext(
                currentUser.id(),
                defaultString(currentUser.username()),
                defaultString(currentUser.nickname()),
                roleCodes,
                permissionCodes,
                null
        );
    }

    /**
     * 恢复给工具编排复用的当前请求快照。
     */
    private AssistantChatRequest restoreCurrentRequest(AssistantConversationState state) {
        if (state.currentRequest() == null) {
            throw new UnauthorizedException("Assistant 会话当前请求快照缺失");
        }
        return state.currentRequest().toChatRequest(state.clientConversationId());
    }

    private void validateStateOwnership(AssistantConversationState state,
                                        AssistantMcpSessionTokenService.AssistantMcpSessionClaims claims) {
        if (state.currentUser() == null || state.currentUser().id() == null) {
            throw new UnauthorizedException("Assistant 会话用户快照缺失");
        }
        if (!Objects.equals(state.currentUser().id(), claims.userId())) {
            throw new UnauthorizedException("Assistant 会话令牌与当前会话用户不匹配");
        }
    }

    private String buildToolCallId(String toolCode) {
        return "mcp-"
                + toolCode.replace(".", "-")
                + "-"
                + Long.toUnsignedString(System.nanoTime());
    }

    private Map<String, Object> sanitizeArguments(Map<String, Object> arguments) {
        if (arguments == null || arguments.isEmpty()) {
            return Map.of();
        }
        LinkedHashMap<String, Object> sanitized = new LinkedHashMap<>();
        for (Map.Entry<String, Object> entry : arguments.entrySet()) {
            if (entry.getKey() == null || entry.getKey().isBlank()) {
                continue;
            }
            sanitized.put(entry.getKey(), entry.getValue());
        }
        return Map.copyOf(sanitized);
    }

    private String normalizeToolCode(String toolCode) {
        if (toolCode == null || toolCode.isBlank()) {
            throw new IllegalArgumentException("工具编码不能为空");
        }
        return toolCode.trim();
    }

    private String defaultString(String value) {
        return value == null ? "" : value.trim();
    }
}
