package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.HermesChatAuditEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.CurrentUserInfo;
import com.aiclub.platform.dto.HermesChatResponse;
import com.aiclub.platform.dto.HermesConversationContextSnapshot;
import com.aiclub.platform.dto.HermesConversationRequestSnapshot;
import com.aiclub.platform.dto.HermesConversationState;
import com.aiclub.platform.dto.HermesConversationTurn;
import com.aiclub.platform.dto.HermesDebugInfo;
import com.aiclub.platform.dto.HermesGroundingState;
import com.aiclub.platform.dto.HermesGroundingTarget;
import com.aiclub.platform.dto.HermesStreamDelta;
import com.aiclub.platform.dto.HermesStreamDone;
import com.aiclub.platform.dto.HermesStreamError;
import com.aiclub.platform.dto.HermesStreamMeta;
import com.aiclub.platform.dto.HermesStreamStatus;
import com.aiclub.platform.dto.request.HermesChatRequest;
import com.aiclub.platform.repository.HermesChatAuditRepository;
import com.aiclub.platform.repository.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.io.IOException;
import java.io.OutputStream;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 顶部 Hermes 助手的会话代理服务。
 * 新版固定采用 Hermes API Server + MCP 工具接入，不再在 backend 内部维护本地 tool loop。
 */
@Service
public class HermesChatService {

    private static final Logger log = LoggerFactory.getLogger(HermesChatService.class);

    private final AuthService authService;
    private final UserRepository userRepository;
    private final HermesProperties hermesProperties;
    private final HermesContextAssembler hermesContextAssembler;
    private final HermesPromptBuilder hermesPromptBuilder;
    private final HermesGatewayService hermesGatewayService;
    private final HermesToolOrchestrator hermesToolOrchestrator;
    private final HermesActionFallbackService hermesActionFallbackService;
    private final HermesConversationStateStore hermesConversationStateStore;
    private final HermesMcpSessionTokenService hermesMcpSessionTokenService;
    private final HermesChatAuditRepository hermesChatAuditRepository;
    private final ObjectMapper objectMapper;

    public HermesChatService(AuthService authService,
                             UserRepository userRepository,
                             HermesProperties hermesProperties,
                             HermesContextAssembler hermesContextAssembler,
                             HermesPromptBuilder hermesPromptBuilder,
                             HermesGatewayService hermesGatewayService,
                             HermesToolOrchestrator hermesToolOrchestrator,
                             HermesActionFallbackService hermesActionFallbackService,
                             HermesConversationStateStore hermesConversationStateStore,
                             HermesMcpSessionTokenService hermesMcpSessionTokenService,
                             HermesChatAuditRepository hermesChatAuditRepository,
                             ObjectMapper objectMapper) {
        this.authService = authService;
        this.userRepository = userRepository;
        this.hermesProperties = hermesProperties;
        this.hermesContextAssembler = hermesContextAssembler;
        this.hermesPromptBuilder = hermesPromptBuilder;
        this.hermesGatewayService = hermesGatewayService;
        this.hermesToolOrchestrator = hermesToolOrchestrator;
        this.hermesActionFallbackService = hermesActionFallbackService;
        this.hermesConversationStateStore = hermesConversationStateStore;
        this.hermesMcpSessionTokenService = hermesMcpSessionTokenService;
        this.hermesChatAuditRepository = hermesChatAuditRepository;
        this.objectMapper = objectMapper;
    }

    /**
     * 流式聊天入口。
     * backend 负责维护会话态和 SSE 包装，Hermes 本身负责工具调用与文本生成。
     */
    public StreamingResponseBody streamChat(HermesChatRequest request) {
        CurrentUserInfo currentUser = authService.currentUser();
        HermesContextAssembler.HermesConversationContext context = hermesContextAssembler.assemble(request, currentUser);
        HermesChatRequest effectiveRequest = resolveEffectiveRequest(request);
        String scopeKey = resolveScopeKey(currentUser.id(), context.projectId(), effectiveRequest.clientConversationId());
        HermesChatAuditEntity audit = createAudit(currentUser, effectiveRequest, context, scopeKey);
        PreparedConversation preparedConversation = prepareConversation(currentUser, context, effectiveRequest, scopeKey);

        return outputStream -> {
            try {
                emitStatus(outputStream, "connecting", "Hermes 正在连接服务");
                writeEvent(outputStream, "meta", buildMetaEvent(preparedConversation.state()));

                HermesGatewayService.HermesGatewayResult gatewayResult = hermesGatewayService.streamChatCompletion(
                        preparedConversation.prompt(),
                        preparedConversation.outboundTranscript(),
                        delta -> {
                            try {
                                writeEvent(outputStream, "delta", new HermesStreamDelta(delta));
                            } catch (IOException exception) {
                                throw new IllegalStateException("Hermes 文本分片发送失败", exception);
                            }
                        }
                );

                HermesConversationState latestState = loadLatestState(preparedConversation.state());
                FinalizedConversation finalizedConversation = finalizeConversation(
                        latestState,
                        preparedConversation.currentUserTurn(),
                        gatewayResult.content(),
                        effectiveRequest,
                        context
                );
                hermesConversationStateStore.save(finalizedConversation.state());
                finishSuccess(outputStream, audit, gatewayResult, finalizedConversation);
            } catch (Exception exception) {
                finishFailure(outputStream, audit, exception);
            }
        };
    }

    /**
     * 非流式聊天入口，主要供稳定消费和测试使用。
     */
    public HermesChatResponse chat(HermesChatRequest request) {
        CurrentUserInfo currentUser = authService.currentUser();
        HermesContextAssembler.HermesConversationContext context = hermesContextAssembler.assemble(request, currentUser);
        HermesChatRequest effectiveRequest = resolveEffectiveRequest(request);
        String scopeKey = resolveScopeKey(currentUser.id(), context.projectId(), effectiveRequest.clientConversationId());
        HermesChatAuditEntity audit = createAudit(currentUser, effectiveRequest, context, scopeKey);
        PreparedConversation preparedConversation = prepareConversation(currentUser, context, effectiveRequest, scopeKey);

        try {
            HermesGatewayService.HermesGatewayResult gatewayResult = hermesGatewayService.createChatCompletion(
                    preparedConversation.prompt(),
                    preparedConversation.outboundTranscript()
            );
            HermesConversationState latestState = loadLatestState(preparedConversation.state());
            FinalizedConversation finalizedConversation = finalizeConversation(
                    latestState,
                    preparedConversation.currentUserTurn(),
                    gatewayResult.content(),
                    effectiveRequest,
                    context
            );
            hermesConversationStateStore.save(finalizedConversation.state());

            audit.setStatus("SUCCESS");
            audit.setResponseSummary(abbreviate(finalizedConversation.content(), 1000));
            audit.setHermesResponseId(defaultString(gatewayResult.responseId()));
            audit.setFinishedAt(LocalDateTime.now());
            hermesChatAuditRepository.save(audit);

            return new HermesChatResponse(
                    finalizedConversation.state().scopeKey(),
                    defaultString(context.roleName()),
                    defaultString(finalizedConversation.content()),
                    finalizedConversation.state().references(),
                    finalizedConversation.state().suggestions(),
                    finalizedConversation.state().actions(),
                    finalizedConversation.state().selectionCards(),
                    buildDebugInfo(finalizedConversation.state(), gatewayResult.responseId())
            );
        } catch (Exception exception) {
            audit.setStatus("FAILED");
            audit.setErrorMessage(abbreviate(resolveErrorMessage(exception), 1000));
            audit.setFinishedAt(LocalDateTime.now());
            hermesChatAuditRepository.save(audit);
            throw exception;
        }
    }

    /**
     * 准备当前轮次的会话态、提示词和待发送 transcript。
     * 复杂之处在于：要先把新的页面上下文和 selection 合并进 Redis，会话工具调用期间 backend 才能拿到最新状态。
     */
    private PreparedConversation prepareConversation(CurrentUserInfo currentUser,
                                                     HermesContextAssembler.HermesConversationContext context,
                                                     HermesChatRequest request,
                                                     String scopeKey) {
        HermesConversationState existingState = hermesConversationStateStore.load(scopeKey, request.clientConversationId())
                .orElse(null);
        HermesGroundingState groundingState = hermesToolOrchestrator.seedGroundingState(
                context,
                request,
                existingState == null ? HermesGroundingState.empty() : existingState.groundingState()
        ).clearPendingSelection();
        String sessionToken = resolveSessionToken(currentUser, scopeKey, request.clientConversationId(), existingState);

        HermesConversationState preparedState = new HermesConversationState(
                scopeKey,
                request.clientConversationId(),
                currentUser,
                HermesConversationContextSnapshot.fromContext(context),
                HermesConversationRequestSnapshot.fromRequest(request),
                sessionToken,
                existingState == null ? List.of() : existingState.transcript(),
                context.references(),
                context.suggestions(),
                List.of(),
                List.of(),
                groundingState,
                List.of(),
                ""
        );
        hermesConversationStateStore.save(preparedState);

        HermesConversationTurn currentUserTurn = buildCurrentUserTurn(request, groundingState);
        HermesPromptBuilder.HermesPrompt prompt = hermesPromptBuilder.buildConversationPrompt(
                currentUser,
                context,
                request,
                groundingState,
                sessionToken
        );

        List<HermesConversationTurn> outboundTranscript = new ArrayList<>(trimTranscript(preparedState.transcript()));
        outboundTranscript.add(currentUserTurn);
        return new PreparedConversation(preparedState, currentUserTurn, List.copyOf(outboundTranscript), prompt);
    }

    /**
     * 当前轮次完成后，把用户消息和助手最终回答写回 transcript。
     */
    private FinalizedConversation finalizeConversation(HermesConversationState latestState,
                                                       HermesConversationTurn currentUserTurn,
                                                       String assistantContent,
                                                       HermesChatRequest request,
                                                       HermesContextAssembler.HermesConversationContext context) {
        HermesConversationState workingState = latestState;
        String resolvedContent = assistantContent;
        if (hermesActionFallbackService.shouldFallback(request, assistantContent)) {
            log.info("Hermes fallback activated for question: {}", abbreviate(request == null ? "" : request.question(), 120));
            HermesActionFallbackService.HermesFallbackResult fallbackResult = hermesActionFallbackService.tryStartRepositoryScan(latestState, request);
            if (fallbackResult == null) {
                fallbackResult = hermesActionFallbackService.tryCreateWorkItemDraft(latestState, request);
            }
            if (fallbackResult != null) {
                log.info("Hermes fallback produced state: actions={}, selections={}",
                        fallbackResult.state().actions().size(),
                        fallbackResult.state().selectionCards().size());
                workingState = fallbackResult.state();
                resolvedContent = fallbackResult.content();
            }
        }
        List<HermesConversationTurn> transcript = new ArrayList<>(latestState == null ? List.of() : latestState.transcript());
        transcript.add(currentUserTurn);
        transcript.add(HermesConversationTurn.assistant(resolvedContent));
        List<HermesConversationTurn> trimmedTranscript = trimTranscript(transcript);

        HermesConversationState finalState = new HermesConversationState(
                workingState.scopeKey(),
                workingState.clientConversationId(),
                workingState.currentUser(),
                HermesConversationContextSnapshot.fromContext(context),
                workingState.currentRequest(),
                workingState.mcpSessionToken(),
                trimmedTranscript,
                workingState.references() == null || workingState.references().isEmpty() ? context.references() : workingState.references(),
                context.suggestions(),
                workingState.actions(),
                workingState.selectionCards(),
                workingState.groundingState(),
                workingState.toolExecutions(),
                workingState.lastErrorMessage()
        );
        return new FinalizedConversation(finalState, resolvedContent);
    }

    /**
     * 构造当前轮次发送给 Hermes 的用户消息。
     * 当本轮来自候选卡片选择时，使用结构化恢复消息替代原始问题，帮助模型理解“你选的是哪个对象”。
     */
    private HermesConversationTurn buildCurrentUserTurn(HermesChatRequest request, HermesGroundingState groundingState) {
        if (request.selection() == null) {
            return HermesConversationTurn.user(request.question());
        }
        HermesGroundingTarget selectedTarget = groundingState == null ? null : groundingState.boundSlot(request.selection().slot());
        if (selectedTarget == null) {
            return HermesConversationTurn.user(request.question());
        }
        String content = """
                用户刚刚在平台候选卡片中完成了对象确认。
                已确认槽位：%s
                已确认对象类型：%s
                已确认对象标题：%s
                已确认对象 ID：%s
                请基于这个已确认对象继续处理原始问题：
                %s
                """.formatted(
                defaultString(request.selection().slot()),
                defaultString(selectedTarget.entityType()),
                defaultString(selectedTarget.title()),
                selectedTarget.entityId() == null ? "" : selectedTarget.entityId(),
                defaultString(request.question())
        );
        return HermesConversationTurn.user(content);
    }

    /**
     * 会话令牌失效、用户切换或 scopeKey 变化时，重新签发新的 `_session_token`。
     */
    private String resolveSessionToken(CurrentUserInfo currentUser,
                                       String scopeKey,
                                       String clientConversationId,
                                       HermesConversationState existingState) {
        return hermesMcpSessionTokenService.issueToken(currentUser, scopeKey, clientConversationId);
    }

    private HermesConversationState loadLatestState(HermesConversationState preparedState) {
        return hermesConversationStateStore.load(preparedState.scopeKey(), preparedState.clientConversationId())
                .orElse(preparedState);
    }

    private List<HermesConversationTurn> trimTranscript(List<HermesConversationTurn> transcript) {
        if (transcript == null || transcript.isEmpty()) {
            return List.of();
        }
        int maxMessageCount = Math.max(2, hermesProperties.getMaxContextMessages() * 2);
        if (transcript.size() <= maxMessageCount) {
            return List.copyOf(transcript);
        }
        return List.copyOf(transcript.subList(transcript.size() - maxMessageCount, transcript.size()));
    }

    private HermesStreamMeta buildMetaEvent(HermesConversationState state) {
        return new HermesStreamMeta(
                state.scopeKey(),
                state.context() == null ? "" : defaultString(state.context().roleName()),
                state.references(),
                state.suggestions(),
                List.of(),
                List.of(),
                buildDebugInfo(state, "")
        );
    }

    private HermesDebugInfo buildDebugInfo(HermesConversationState state, String responseId) {
        List<Map<String, Object>> assistantTurns = List.of(Map.of(
                "transport", "chat.completions",
                "responseId", defaultString(responseId),
                "transcriptSize", state == null || state.transcript() == null ? 0 : state.transcript().size(),
                "pendingActions", state == null || state.actions() == null ? 0 : state.actions().size(),
                "pendingSelections", state == null || state.selectionCards() == null ? 0 : state.selectionCards().size()
        ));
        return new HermesDebugInfo(
                hermesProperties.getModel(),
                "API_SERVER",
                state == null || state.toolExecutions() == null ? 0 : state.toolExecutions().size(),
                assistantTurns,
                toMap(state == null ? HermesGroundingState.empty() : state.groundingState()),
                toMap(state == null ? HermesGroundingState.empty() : state.groundingState()),
                state == null ? List.of() : state.toolExecutions(),
                state == null ? "" : defaultString(state.lastErrorMessage())
        );
    }

    private Map<String, Object> toMap(HermesGroundingState groundingState) {
        LinkedHashMap<String, Object> debug = new LinkedHashMap<>();
        if (groundingState == null) {
            return debug;
        }
        debug.put("boundSlots", groundingState.boundSlots());
        debug.put("recentResolvedSlots", groundingState.recentResolvedSlots());
        debug.put("pendingSelectionCount", groundingState.pendingSelectionCards() == null ? 0 : groundingState.pendingSelectionCards().size());
        debug.put("resumeQuestion", defaultString(groundingState.resumeQuestion()));
        return debug;
    }

    private void finishSuccess(OutputStream outputStream,
                               HermesChatAuditEntity audit,
                               HermesGatewayService.HermesGatewayResult gatewayResult,
                               FinalizedConversation finalizedConversation) {
        audit.setStatus("SUCCESS");
        audit.setResponseSummary(abbreviate(finalizedConversation.content(), 1000));
        audit.setHermesResponseId(defaultString(gatewayResult.responseId()));
        audit.setFinishedAt(LocalDateTime.now());
        hermesChatAuditRepository.save(audit);

        try {
            writeEvent(outputStream, "done", new HermesStreamDone(
                    finalizedConversation.state().scopeKey(),
                    finalizedConversation.state().context() == null ? "" : defaultString(finalizedConversation.state().context().roleName()),
                    defaultString(finalizedConversation.content()),
                    finalizedConversation.state().references(),
                    finalizedConversation.state().suggestions(),
                    finalizedConversation.state().actions(),
                    finalizedConversation.state().selectionCards(),
                    buildDebugInfo(finalizedConversation.state(), gatewayResult.responseId())
            ));
        } catch (IOException exception) {
            throw new IllegalStateException("Hermes 完成事件发送失败", exception);
        }
    }

    private void finishFailure(OutputStream outputStream, HermesChatAuditEntity audit, Exception exception) {
        audit.setStatus("FAILED");
        audit.setErrorMessage(abbreviate(resolveErrorMessage(exception), 1000));
        audit.setFinishedAt(LocalDateTime.now());
        hermesChatAuditRepository.save(audit);

        try {
            writeEvent(outputStream, "error", new HermesStreamError(resolveErrorMessage(exception)));
        } catch (IOException sendException) {
            throw new IllegalStateException("Hermes 错误事件发送失败", sendException);
        }
    }

    private void emitStatus(OutputStream outputStream, String stage, String message) throws IOException {
        writeEvent(outputStream, "status", new HermesStreamStatus(stage, message));
    }

    private void writeEvent(OutputStream outputStream, String eventName, Object payload) throws IOException {
        String json = objectMapper.writeValueAsString(payload);
        String ssePayload = "event:" + eventName + "\n" + "data:" + json + "\n\n";
        outputStream.write(ssePayload.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        outputStream.flush();
    }

    private HermesChatAuditEntity createAudit(CurrentUserInfo currentUser,
                                              HermesChatRequest request,
                                              HermesContextAssembler.HermesConversationContext context,
                                              String scopeKey) {
        HermesChatAuditEntity entity = new HermesChatAuditEntity();
        UserEntity auditUser = currentUser == null || currentUser.id() == null
                ? null
                : userRepository.findById(currentUser.id()).orElse(null);
        entity.setUser(auditUser);
        entity.setScopeKey(scopeKey);
        entity.setRouteName(defaultString(request.routeName()));
        entity.setProjectId(context.projectId());
        entity.setTaskId(context.taskId());
        entity.setIterationId(request.iterationId());
        entity.setPlanId(request.planId());
        entity.setRoleName(defaultString(context.roleName()));
        entity.setQuestionSummary(abbreviate(request.question(), 500));
        entity.setStatus("RUNNING");
        return hermesChatAuditRepository.save(entity);
    }

    private HermesChatRequest resolveEffectiveRequest(HermesChatRequest request) {
        String sanitizedConversationId = sanitizeConversationId(request.clientConversationId());
        if (sanitizedConversationId == null || sanitizedConversationId.isBlank()) {
            sanitizedConversationId = "conversation-" + System.currentTimeMillis();
        }
        return new HermesChatRequest(
                request.question(),
                request.routeName(),
                request.projectId(),
                request.taskId(),
                request.iterationId(),
                request.planId(),
                sanitizedConversationId,
                request.selection(),
                request.debug()
        );
    }

    private String resolveScopeKey(Long userId, Long projectId, String clientConversationId) {
        String conversationSuffix = sanitizeConversationId(clientConversationId);
        if (projectId != null) {
            if (conversationSuffix != null) {
                return hermesProperties.getSessionPrefix() + ":project:" + projectId + ":user:" + userId + ":conversation:" + conversationSuffix;
            }
            return hermesProperties.getSessionPrefix() + ":project:" + projectId + ":user:" + userId;
        }
        if (conversationSuffix != null) {
            return hermesProperties.getSessionPrefix() + ":global:user:" + userId + ":conversation:" + conversationSuffix;
        }
        return hermesProperties.getSessionPrefix() + ":global:user:" + userId;
    }

    private String sanitizeConversationId(String clientConversationId) {
        if (clientConversationId == null || clientConversationId.isBlank()) {
            return null;
        }
        return clientConversationId.trim().replaceAll("[^a-zA-Z0-9:_-]", "");
    }

    private String resolveErrorMessage(Exception exception) {
        if (exception == null || exception.getMessage() == null || exception.getMessage().isBlank()) {
            return "Hermes 助手暂时不可用";
        }
        return exception.getMessage().trim();
    }

    private String abbreviate(String value, int maxLength) {
        if (value == null || value.length() <= maxLength) {
            return value;
        }
        return value.substring(0, maxLength);
    }

    private String defaultString(String value) {
        return value == null ? "" : value.trim();
    }

    /**
     * 一次会话请求准备阶段产生的中间结果。
     */
    private record PreparedConversation(
            HermesConversationState state,
            HermesConversationTurn currentUserTurn,
            List<HermesConversationTurn> outboundTranscript,
            HermesPromptBuilder.HermesPrompt prompt
    ) {
    }

    /**
     * 当前轮次完成后最终写回给前端和 Redis 的结果。
     */
    private record FinalizedConversation(
            HermesConversationState state,
            String content
    ) {
    }
}
