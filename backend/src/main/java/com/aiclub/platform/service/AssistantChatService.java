package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.AssistantChatAuditEntity;
import com.aiclub.platform.domain.model.AssistantConversationSessionEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.CurrentUserInfo;
import com.aiclub.platform.dto.AssistantChatResponse;
import com.aiclub.platform.dto.AssistantConversationDetail;
import com.aiclub.platform.dto.AssistantConversationMessageItem;
import com.aiclub.platform.dto.AssistantConversationContextSnapshot;
import com.aiclub.platform.dto.AssistantConversationRequestSnapshot;
import com.aiclub.platform.dto.AssistantConversationState;
import com.aiclub.platform.dto.AssistantConversationTurn;
import com.aiclub.platform.dto.AssistantConversationContextState;
import com.aiclub.platform.dto.AssistantToolExecutionPolicy;
import com.aiclub.platform.dto.AssistantDebugInfo;
import com.aiclub.platform.dto.AssistantGroundingState;
import com.aiclub.platform.dto.AssistantGroundingTarget;
import com.aiclub.platform.dto.AssistantResponseMetadata;
import com.aiclub.platform.dto.AssistantSelectionCard;
import com.aiclub.platform.dto.AssistantStreamDelta;
import com.aiclub.platform.dto.AssistantStreamDone;
import com.aiclub.platform.dto.AssistantStreamError;
import com.aiclub.platform.dto.AssistantStreamMeta;
import com.aiclub.platform.dto.AssistantStreamStatus;
import com.aiclub.platform.dto.request.AssistantChatRequest;
import com.aiclub.platform.dto.request.AssistantMultipartChatCommand;
import com.aiclub.platform.dto.request.AssistantSessionChatRequest;
import com.aiclub.platform.repository.AssistantChatAuditRepository;
import com.aiclub.platform.repository.UserRepository;
import com.aiclub.platform.runtime.RuntimeChatResult;
import com.aiclub.platform.runtime.RuntimeInvocationContext;
import com.aiclub.platform.runtime.RuntimeContextProfile;
import com.aiclub.platform.runtime.RuntimeCapability;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.io.IOException;
import java.io.OutputStream;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

/**
 * Assistant 会话代理服务。
 * 新版固定采用“数据库会话记录 + Redis 热状态”的双层结构：
 * 数据库负责回显历史记录，Redis 继续承载 Assistant 运行时隐藏记忆与工具链上下文。
 */
@Service
public class AssistantChatService {

    private static final Logger log = LoggerFactory.getLogger(AssistantChatService.class);

    private final AuthService authService;
    private final UserRepository userRepository;
    private final AssistantProperties assistantProperties;
    private final AssistantContextAssembler assistantContextAssembler;
    private final AssistantPromptBuilder assistantPromptBuilder;
    private final AssistantGatewayService assistantGatewayService;
    private final AssistantHindsightMemoryService assistantHindsightMemoryService;
    private final AssistantToolOrchestrator assistantToolOrchestrator;
    private final AssistantActionFallbackService assistantActionFallbackService;
    private final AssistantConversationStateStore assistantConversationStateStore;
    private final AssistantMcpSessionTokenService assistantMcpSessionTokenService;
    private final AssistantChatAuditRepository assistantChatAuditRepository;
    private final AssistantConversationSessionService assistantConversationSessionService;
    private final AssistantAttachmentService assistantAttachmentService;
    private final WikiKnowledgeSearchService wikiKnowledgeSearchService;
    private final AssistantFileLibraryService assistantFileLibraryService;
    private final RuntimeChatService runtimeChatService;
    private final ObjectMapper objectMapper;
    private final AssistantConversationContextService assistantConversationContextService = new AssistantConversationContextService();

    @Autowired
    public AssistantChatService(AuthService authService,
                             UserRepository userRepository,
                             AssistantProperties assistantProperties,
                             AssistantContextAssembler assistantContextAssembler,
                             AssistantPromptBuilder assistantPromptBuilder,
                             AssistantGatewayService assistantGatewayService,
                             AssistantHindsightMemoryService assistantHindsightMemoryService,
                             AssistantToolOrchestrator assistantToolOrchestrator,
                             AssistantActionFallbackService assistantActionFallbackService,
                             AssistantConversationStateStore assistantConversationStateStore,
                             AssistantMcpSessionTokenService assistantMcpSessionTokenService,
                             AssistantChatAuditRepository assistantChatAuditRepository,
                             AssistantConversationSessionService assistantConversationSessionService,
                             AssistantAttachmentService assistantAttachmentService,
                             WikiKnowledgeSearchService wikiKnowledgeSearchService,
                             AssistantFileLibraryService assistantFileLibraryService,
                             RuntimeChatService runtimeChatService,
                             ObjectMapper objectMapper) {
        this.authService = authService;
        this.userRepository = userRepository;
        this.assistantProperties = assistantProperties;
        this.assistantContextAssembler = assistantContextAssembler;
        this.assistantPromptBuilder = assistantPromptBuilder;
        this.assistantGatewayService = assistantGatewayService;
        this.assistantHindsightMemoryService = assistantHindsightMemoryService;
        this.assistantToolOrchestrator = assistantToolOrchestrator;
        this.assistantActionFallbackService = assistantActionFallbackService;
        this.assistantConversationStateStore = assistantConversationStateStore;
        this.assistantMcpSessionTokenService = assistantMcpSessionTokenService;
        this.assistantChatAuditRepository = assistantChatAuditRepository;
        this.assistantConversationSessionService = assistantConversationSessionService;
        this.assistantAttachmentService = assistantAttachmentService;
        this.wikiKnowledgeSearchService = wikiKnowledgeSearchService;
        this.assistantFileLibraryService = assistantFileLibraryService;
        this.runtimeChatService = runtimeChatService;
        this.objectMapper = objectMapper;
    }

    /**
     * 兼容旧测试构造方式：未注入个人文件库时仅跳过个人文件库证据召回。
     */
    public AssistantChatService(AuthService authService,
                             UserRepository userRepository,
                             AssistantProperties assistantProperties,
                             AssistantContextAssembler assistantContextAssembler,
                             AssistantPromptBuilder assistantPromptBuilder,
                             AssistantGatewayService assistantGatewayService,
                             AssistantHindsightMemoryService assistantHindsightMemoryService,
                             AssistantToolOrchestrator assistantToolOrchestrator,
                             AssistantActionFallbackService assistantActionFallbackService,
                             AssistantConversationStateStore assistantConversationStateStore,
                             AssistantMcpSessionTokenService assistantMcpSessionTokenService,
                             AssistantChatAuditRepository assistantChatAuditRepository,
                             AssistantConversationSessionService assistantConversationSessionService,
                             AssistantAttachmentService assistantAttachmentService,
                             WikiKnowledgeSearchService wikiKnowledgeSearchService,
                             ObjectMapper objectMapper) {
        this(authService, userRepository, assistantProperties, assistantContextAssembler, assistantPromptBuilder, assistantGatewayService,
                assistantHindsightMemoryService, assistantToolOrchestrator, assistantActionFallbackService, assistantConversationStateStore, assistantMcpSessionTokenService,
                assistantChatAuditRepository, assistantConversationSessionService, assistantAttachmentService, wikiKnowledgeSearchService, null, null, objectMapper);
    }

    /** 兼容尚未接入 Runtime 路由的旧测试构造方式，默认所有会话走 Assistant Legacy。 */
    public AssistantChatService(AuthService authService,
                             UserRepository userRepository,
                             AssistantProperties assistantProperties,
                             AssistantContextAssembler assistantContextAssembler,
                             AssistantPromptBuilder assistantPromptBuilder,
                             AssistantGatewayService assistantGatewayService,
                             AssistantHindsightMemoryService assistantHindsightMemoryService,
                             AssistantToolOrchestrator assistantToolOrchestrator,
                             AssistantActionFallbackService assistantActionFallbackService,
                             AssistantConversationStateStore assistantConversationStateStore,
                             AssistantMcpSessionTokenService assistantMcpSessionTokenService,
                             AssistantChatAuditRepository assistantChatAuditRepository,
                             AssistantConversationSessionService assistantConversationSessionService,
                             AssistantAttachmentService assistantAttachmentService,
                             WikiKnowledgeSearchService wikiKnowledgeSearchService,
                             AssistantFileLibraryService assistantFileLibraryService,
                             ObjectMapper objectMapper) {
        this(authService, userRepository, assistantProperties, assistantContextAssembler, assistantPromptBuilder, assistantGatewayService,
                assistantHindsightMemoryService, assistantToolOrchestrator, assistantActionFallbackService, assistantConversationStateStore,
                assistantMcpSessionTokenService, assistantChatAuditRepository, assistantConversationSessionService, assistantAttachmentService,
                wikiKnowledgeSearchService, assistantFileLibraryService, null, objectMapper);
    }

    /**
     * 兼容旧测试构造方式。
     */
    public AssistantChatService(AuthService authService,
                             UserRepository userRepository,
                             AssistantProperties assistantProperties,
                             AssistantContextAssembler assistantContextAssembler,
                             AssistantPromptBuilder assistantPromptBuilder,
                             AssistantGatewayService assistantGatewayService,
                             AssistantHindsightMemoryService assistantHindsightMemoryService,
                             AssistantToolOrchestrator assistantToolOrchestrator,
                             AssistantActionFallbackService assistantActionFallbackService,
                             AssistantConversationStateStore assistantConversationStateStore,
                             AssistantMcpSessionTokenService assistantMcpSessionTokenService,
                             AssistantChatAuditRepository assistantChatAuditRepository,
                             AssistantConversationSessionService assistantConversationSessionService,
                             ObjectMapper objectMapper) {
        this(authService, userRepository, assistantProperties, assistantContextAssembler, assistantPromptBuilder, assistantGatewayService,
                assistantHindsightMemoryService, assistantToolOrchestrator, assistantActionFallbackService, assistantConversationStateStore, assistantMcpSessionTokenService,
                assistantChatAuditRepository, assistantConversationSessionService, null, null, null, null, objectMapper);
    }

    /**
     * 基于指定会话执行流式聊天。
     */
    public StreamingResponseBody streamChat(Long sessionId, AssistantSessionChatRequest request) {
        return streamChatInternal(sessionId, request, List.of());
    }

    /**
     * 基于指定会话执行带附件的流式聊天。
     */
    public StreamingResponseBody streamChat(Long sessionId, AssistantMultipartChatCommand command) {
        return streamChatInternal(
                sessionId,
                new AssistantSessionChatRequest(command.question(), command.selection(), command.debug(), command.slashCommand()),
                uploadAndConvert(command.files())
        );
    }

    private StreamingResponseBody streamChatInternal(Long sessionId,
                                                     AssistantSessionChatRequest request,
                                                     List<AssistantAttachmentService.PreparedAttachment> attachments) {
        AssistantConversationSessionEntity session = assistantConversationSessionService.requireOwnedSession(sessionId);
        validateSessionAvailableForChat(session);
        CurrentUserInfo currentUser = authService.currentUser();
        AssistantChatRequest boundRequest = buildBoundRequest(session, request);
        AssistantContextAssembler.AssistantConversationContext context = assistantContextAssembler.assemble(boundRequest, currentUser);
        AssistantChatRequest effectiveRequest = resolveEffectiveRequest(boundRequest, session);
        String scopeKey = resolveScopeKey(currentUser.id(), context.projectId(), effectiveRequest.clientConversationId());
        AssistantChatAuditEntity audit = createAudit(currentUser, effectiveRequest, context, scopeKey);
        String attachmentContextMarkdown = resolveAttachmentContextMarkdown(session, attachments);
        RuntimeContextProfile contextProfile = assistantConversationSessionService.resolveRuntimeContextProfile(session);
        boolean nativeCompactionAvailable = supportsNativeCompaction(session);
        PreparedConversation preparedConversation = prepareConversation(currentUser, context, effectiveRequest, scopeKey, attachmentContextMarkdown,
                contextProfile, assistantConversationSessionService.readContextState(session),
                assistantConversationSessionService.readTranscript(session), nativeCompactionAvailable);

        return outputStream -> {
            try {
                emitStatus(outputStream, "connecting", "GitPilot 正在连接服务");
                writeEvent(outputStream, "meta", buildMetaEvent(preparedConversation.state()));
                emitStatus(outputStream, "thinking", "GitPilot 正在思考");
                AssistantResponseStreamFilter responseStreamFilter = new AssistantResponseStreamFilter(AssistantResponseMetadata.markerPrefix());

                ChatExecutionResult gatewayResult = executeChat(
                        session,
                        preparedConversation,
                        delta -> {
                            responseStreamFilter.accept(delta, visibleDelta -> {
                                try {
                                    writeEvent(outputStream, "delta", new AssistantStreamDelta(visibleDelta));
                                } catch (IOException exception) {
                                    throw new AssistantClientStreamDisconnectedException("GitPilot 客户端流式连接已断开", exception);
                                }
                            });
                        }
                );
                responseStreamFilter.finish(visibleDelta -> {
                    try {
                        writeEvent(outputStream, "delta", new AssistantStreamDelta(visibleDelta));
                    } catch (IOException exception) {
                        throw new AssistantClientStreamDisconnectedException("GitPilot 客户端流式连接已断开", exception);
                    }
                });

                AssistantConversationState latestState = loadLatestState(preparedConversation.state());
                FinalizedConversation finalizedConversation = finalizeConversation(
                        latestState,
                        preparedConversation.currentUserTurn(),
                        gatewayResult.content(),
                        effectiveRequest,
                        context
                );
                applyGeneratedTitle(session, finalizedConversation.autoTitle());
                assistantConversationStateStore.save(finalizedConversation.state());
                AssistantDebugInfo debugInfo = buildDebugInfo(finalizedConversation.state(), gatewayResult.responseId());
                AssistantConversationDetail persistedDetail = assistantConversationSessionService.recordSuccess(
                        session,
                        effectiveRequest,
                        finalizedConversation.state(),
                        finalizedConversation.content(),
                        debugInfo,
                        attachments
                );
                assistantHindsightMemoryService.retainConversationTurnAsync(
                        currentUser,
                        session,
                        context,
                        effectiveRequest,
                        finalizedConversation.content(),
                        finalizedConversation.state()
                );
                finishSuccess(outputStream, sessionId, audit, gatewayResult, finalizedConversation, debugInfo, attachments, persistedDetail);
            } catch (AssistantClientStreamDisconnectedException exception) {
                log.info("Assistant 流式响应写出时客户端已断开，停止当前输出：{}", resolveErrorMessage(exception));
                AssistantConversationState latestState = loadLatestState(preparedConversation.state());
                AssistantDebugInfo debugInfo = buildDebugInfo(latestState, "");
                if (shouldPersistDisplayStateOnDisconnect(latestState)) {
                    assistantConversationSessionService.recordLatestDisplayState(session, latestState, debugInfo);
                }
                audit.setStatus("CLIENT_DISCONNECTED");
                audit.setErrorMessage(abbreviate(resolveErrorMessage(exception), 1000));
                audit.setFinishedAt(LocalDateTime.now());
                assistantChatAuditRepository.save(audit);
            } catch (Exception exception) {
                AssistantConversationState latestState = loadLatestState(preparedConversation.state());
                AssistantDebugInfo debugInfo = buildDebugInfo(latestState, "");
                assistantConversationSessionService.recordFailure(
                        session,
                        effectiveRequest,
                        latestState,
                        resolveErrorMessage(exception),
                        debugInfo,
                        attachments
                );
                finishFailure(outputStream, audit, exception);
            }
        };
    }

    /**
     * 基于指定会话执行非流式聊天，主要供测试与稳定消费场景使用。
     */
    public AssistantChatResponse chat(Long sessionId, AssistantSessionChatRequest request) {
        return chatInternal(sessionId, request, List.of());
    }

    /**
     * 基于指定会话执行带附件的非流式聊天。
     */
    public AssistantChatResponse chat(Long sessionId, AssistantMultipartChatCommand command) {
        return chatInternal(
                sessionId,
                new AssistantSessionChatRequest(command.question(), command.selection(), command.debug(), command.slashCommand()),
                uploadAndConvert(command.files())
        );
    }

    private AssistantChatResponse chatInternal(Long sessionId,
                                            AssistantSessionChatRequest request,
                                            List<AssistantAttachmentService.PreparedAttachment> attachments) {
        AssistantConversationSessionEntity session = assistantConversationSessionService.requireOwnedSession(sessionId);
        validateSessionAvailableForChat(session);
        CurrentUserInfo currentUser = authService.currentUser();
        AssistantChatRequest boundRequest = buildBoundRequest(session, request);
        AssistantContextAssembler.AssistantConversationContext context = assistantContextAssembler.assemble(boundRequest, currentUser);
        AssistantChatRequest effectiveRequest = resolveEffectiveRequest(boundRequest, session);
        String scopeKey = resolveScopeKey(currentUser.id(), context.projectId(), effectiveRequest.clientConversationId());
        AssistantChatAuditEntity audit = createAudit(currentUser, effectiveRequest, context, scopeKey);
        String attachmentContextMarkdown = resolveAttachmentContextMarkdown(session, attachments);
        RuntimeContextProfile contextProfile = assistantConversationSessionService.resolveRuntimeContextProfile(session);
        boolean nativeCompactionAvailable = supportsNativeCompaction(session);
        PreparedConversation preparedConversation = prepareConversation(currentUser, context, effectiveRequest, scopeKey, attachmentContextMarkdown,
                contextProfile, assistantConversationSessionService.readContextState(session),
                assistantConversationSessionService.readTranscript(session), nativeCompactionAvailable);

        try {
            ChatExecutionResult gatewayResult = executeChat(session, preparedConversation, null);
            AssistantConversationState latestState = loadLatestState(preparedConversation.state());
            FinalizedConversation finalizedConversation = finalizeConversation(
                    latestState,
                    preparedConversation.currentUserTurn(),
                    gatewayResult.content(),
                    effectiveRequest,
                    context
            );
            applyGeneratedTitle(session, finalizedConversation.autoTitle());
            assistantConversationStateStore.save(finalizedConversation.state());
            AssistantDebugInfo debugInfo = buildDebugInfo(finalizedConversation.state(), gatewayResult.responseId());
            AssistantConversationDetail persistedDetail = assistantConversationSessionService.recordSuccess(
                    session,
                    effectiveRequest,
                    finalizedConversation.state(),
                    finalizedConversation.content(),
                    debugInfo,
                    attachments
            );
            assistantHindsightMemoryService.retainConversationTurnAsync(
                    currentUser,
                    session,
                    context,
                    effectiveRequest,
                    finalizedConversation.content(),
                    finalizedConversation.state()
            );

            audit.setStatus("SUCCESS");
            audit.setResponseSummary(abbreviate(finalizedConversation.content(), 1000));
            audit.setAssistantResponseId(defaultString(gatewayResult.responseId()));
            audit.setFinishedAt(LocalDateTime.now());
            assistantChatAuditRepository.save(audit);

            return new AssistantChatResponse(
                    sessionId,
                    resolveMessageId(persistedDetail, "user"),
                    resolveMessageId(persistedDetail, "assistant"),
                    finalizedConversation.state().scopeKey(),
                    defaultString(context.roleName()),
                    defaultString(finalizedConversation.content()),
                    finalizedConversation.state().references(),
                    finalizedConversation.state().suggestions(),
                    finalizedConversation.state().actions(),
                    finalizedConversation.state().selectionCards(),
                    null,
                    toAttachmentSummaries(attachments)
            );
        } catch (Exception exception) {
            AssistantConversationState latestState = loadLatestState(preparedConversation.state());
            AssistantDebugInfo debugInfo = buildDebugInfo(latestState, "");
            assistantConversationSessionService.recordFailure(
                    session,
                    effectiveRequest,
                    latestState,
                    resolveErrorMessage(exception),
                    debugInfo,
                    attachments
            );
            audit.setStatus("FAILED");
            audit.setErrorMessage(abbreviate(resolveErrorMessage(exception), 1000));
            audit.setFinishedAt(LocalDateTime.now());
            assistantChatAuditRepository.save(audit);
            throw exception;
        }
    }

    /**
     * 按会话创建时固化的 Runtime 执行当前轮次。
     * Legacy 继续保留原生工具调用链；其他 Runtime 通过统一同步聊天协议执行，避免平台入口仍偷偷固定到 Assistant。
     */
    private ChatExecutionResult executeChat(AssistantConversationSessionEntity session,
                                             PreparedConversation preparedConversation,
                                             Consumer<String> deltaConsumer) {
        String runtimeCode = defaultString(session.getRuntimeRegistryCode()).isBlank()
                ? RuntimeChatService.HERMES_LEGACY
                : session.getRuntimeRegistryCode().trim().toUpperCase(java.util.Locale.ROOT);
        if (runtimeChatService == null || runtimeChatService.isLegacy(runtimeCode)) {
            AssistantGatewayService.AssistantGatewayResult result = deltaConsumer == null
                    ? assistantGatewayService.createChatCompletion(
                    preparedConversation.prompt(), preparedConversation.outboundTranscript())
                    : assistantGatewayService.streamChatCompletion(
                    preparedConversation.prompt(), preparedConversation.outboundTranscript(), delta -> deltaConsumer.accept(delta));
            return new ChatExecutionResult(result.content(), result.responseId());
        }

        Map<String, Object> requestBody = new LinkedHashMap<>();
        requestBody.put("runId", "gitpilot-session-" + session.getId() + "-" + System.nanoTime());
        requestBody.put("sessionId", preparedConversation.state().clientConversationId());
        requestBody.put("systemPrompt", preparedConversation.prompt().systemPrompt());
        requestBody.put("input", preparedConversation.currentUserTurn().content());
        requestBody.put("sessionToken", preparedConversation.state().mcpSessionToken());
        requestBody.put("contextProfile", assistantConversationSessionService.resolveRuntimeContextProfile(session));
        RuntimeInvocationContext context = new RuntimeInvocationContext(
                String.valueOf(requestBody.get("runId")),
                preparedConversation.state().clientConversationId(),
                preparedConversation.currentUserTurn().content(),
                preparedConversation.prompt().systemPrompt(),
                Map.of("requestBody", requestBody),
                Map.of("runtimeRegistryCode", runtimeCode,
                        "runtimeProfileVersion", session.getRuntimeProfileVersion() == null ? 1L : session.getRuntimeProfileVersion()),
                com.aiclub.platform.runtime.RuntimeToolContext.empty(),
                assistantConversationSessionService.resolveRuntimeContextProfile(session)
        ).withConversationHistory(com.aiclub.platform.runtime.RuntimeConversationMessage
                .fromAssistantTurns(preparedConversation.outboundTranscript()));
        context = runtimeChatService.withToolContract(
                context,
                preparedConversation.state().currentUser(),
                preparedConversation.state().mcpSessionToken(),
                null,
                null
        );
        if (deltaConsumer == null) {
            RuntimeChatResult result = runtimeChatService.chat(runtimeCode, context);
            return new ChatExecutionResult(result.content(), result.runId());
        }
        RuntimeChatResult result = runtimeChatService.streamChat(runtimeCode, context, event -> {
            String delta = event.textDelta();
            if (hasText(delta)) {
                deltaConsumer.accept(delta);
            }
        });
        return new ChatExecutionResult(result.content(), result.runId());
    }

    /**
     * 将已持久化会话绑定信息与本轮聊天输入合并成 Assistant 真实请求。
     * 这里的关键点是：继续聊天时始终以会话创建时的上下文为准，而不是当前页面上下文。
     */
    private AssistantChatRequest buildBoundRequest(AssistantConversationSessionEntity session, AssistantSessionChatRequest request) {
        return new AssistantChatRequest(
                request.question(),
                session.getRouteName(),
                session.getProjectId(),
                session.getTaskId(),
                session.getIterationId(),
                session.getPlanId(),
                session.getWikiSpaceId(),
                session.getWikiPageId(),
                session.getClientConversationId(),
                request.selection(),
                null,
                request.slashCommand()
        );
    }

    /**
     * 准备当前轮次的会话态、提示词和待发送 transcript。
     * 复杂之处在于：要先把新的页面上下文和 selection 合并进 Redis，会话工具调用期间 backend 才能拿到最新状态。
     */
    private PreparedConversation prepareConversation(CurrentUserInfo currentUser,
                                                      AssistantContextAssembler.AssistantConversationContext context,
                                                      AssistantChatRequest request,
                                                      String scopeKey,
                                                      String attachmentContextMarkdown,
                                                      RuntimeContextProfile contextProfile,
                                                      AssistantConversationContextState persistedContextState,
                                                      List<AssistantConversationTurn> databaseTranscript,
                                                      boolean nativeCompactionAvailable) {
        AssistantConversationState existingState = assistantConversationStateStore.load(scopeKey, request.clientConversationId())
                .orElse(null);
        // Redis 只承担热状态；首次恢复时把数据库原始消息交给 Context Service，避免换设备后只剩摘要而丢失最近完整消息。
        List<AssistantConversationTurn> restoredTranscript = existingState == null
                ? (databaseTranscript == null ? List.of() : databaseTranscript)
                : existingState.transcript();
        AssistantGroundingState groundingState = assistantToolOrchestrator.seedGroundingState(
                context,
                request,
                existingState == null ? AssistantGroundingState.empty() : existingState.groundingState()
        ).clearPendingSelection();
        String sessionToken = resolveSessionToken(currentUser, scopeKey, request.clientConversationId(), existingState);

        AssistantConversationState preparedState = new AssistantConversationState(
                scopeKey,
                request.clientConversationId(),
                currentUser,
                AssistantConversationContextSnapshot.fromContext(context),
                AssistantConversationRequestSnapshot.fromRequest(request),
                sessionToken,
                restoredTranscript,
                context.references(),
                context.suggestions(),
                resolvePreparedActions(existingState, request),
                resolvePreparedSelectionCards(existingState, request),
                groundingState,
                List.of(),
                existingState == null ? "" : existingState.lastErrorMessage(),
                existingState == null ? AssistantToolExecutionPolicy.empty() : existingState.toolExecutionPolicy(),
                existingState == null ? persistedContextState : existingState.contextState()
        );
        AssistantConversationContextService.ContextPreparation contextPreparation = assistantConversationContextService.prepare(
                preparedState.transcript(), preparedState.contextState(), contextProfile,
                AssistantConversationContextService.ContextBudget.empty(), nativeCompactionAvailable);
        preparedState = preparedState.withContextState(contextPreparation.state());

        String memoryContextMarkdown = resolveMemoryContextMarkdown(currentUser, context, request);
        String fileLibraryEvidenceMarkdown = resolveFileLibraryEvidenceMarkdown(currentUser, request);
        AssistantConversationTurn currentUserTurn = buildCurrentUserTurn(
                request, groundingState, attachmentContextMarkdown, fileLibraryEvidenceMarkdown,
                assistantConversationContextService.renderSummary(contextPreparation.state()));
        String combinedMemoryContextMarkdown = combineMemoryContext(memoryContextMarkdown, fileLibraryEvidenceMarkdown);
        AssistantPromptBuilder.AssistantPrompt prompt = assistantPromptBuilder.buildConversationPrompt(
                currentUser,
                context,
                request,
                groundingState,
                sessionToken,
                currentUserTurn.content(),
                combinedMemoryContextMarkdown
        );

        // 第二次预算计算把真实 system prompt、页面上下文、工具契约预留和本轮输入计入，避免只按历史消息长度判断是否超窗。
        AssistantConversationContextService.ContextPreparation budgetedPreparation = assistantConversationContextService.prepare(
                contextPreparation.outboundTranscript(), preparedState.contextState(), contextProfile,
                new AssistantConversationContextService.ContextBudget(
                        prompt.systemPrompt(),
                        2048,
                        context == null ? "" : context.contextMarkdown(),
                        currentUserTurn.content()
                ), nativeCompactionAvailable);
        boolean contextChanged = !budgetedPreparation.state().summary().equals(preparedState.contextState().summary())
                || !budgetedPreparation.state().facts().equals(preparedState.contextState().facts())
                || !budgetedPreparation.state().pendingClarification().equals(preparedState.contextState().pendingClarification())
                || !budgetedPreparation.outboundTranscript().equals(contextPreparation.outboundTranscript());
        preparedState = preparedState.withContextState(budgetedPreparation.state());
        if (contextChanged) {
            currentUserTurn = buildCurrentUserTurn(
                    request, groundingState, attachmentContextMarkdown, fileLibraryEvidenceMarkdown,
                    assistantConversationContextService.renderSummary(budgetedPreparation.state()));
            prompt = assistantPromptBuilder.buildConversationPrompt(
                    currentUser, context, request, groundingState, sessionToken,
                    currentUserTurn.content(), combinedMemoryContextMarkdown
            );
            contextPreparation = budgetedPreparation;
        }
        if (!contextChanged) {
            // 即使没有触发压缩，也要保存包含完整预算组成的估算值。
            contextPreparation = budgetedPreparation;
        }
        assistantConversationStateStore.save(preparedState);

        return new PreparedConversation(
                preparedState,
                currentUserTurn,
                contextPreparation.outboundTranscript(),
                prompt
        );
    }

    /** 根据会话创建时绑定的 Runtime 判断是否可把压缩交给 Runtime 原生实现。 */
    private boolean supportsNativeCompaction(AssistantConversationSessionEntity session) {
        if (session == null || runtimeChatService == null) {
            return false;
        }
        return runtimeChatService.supportsCapability(session.getRuntimeRegistryCode(), RuntimeCapability.NATIVE_COMPACTION);
    }

    /**
     * 每次用户主动发送新问题时，上一轮待确认动作都应失效。
     * 否则前端刚清空确认区，后端首包 meta 又会把旧动作卡片刷回来，造成“确认不响应”的错觉。
     */
    private List<com.aiclub.platform.dto.AssistantActionSummary> resolvePreparedActions(AssistantConversationState existingState,
                                                                                      AssistantChatRequest request) {
        return List.of();
    }

    /**
     * 用户主动发送新问题或已经在候选卡片中完成确认后，本轮展示态不应继续回显上一轮的待确认卡片。
     * 否则前端会被旧 meta/done 事件重新刷回“需要确认”区块。
     */
    private List<com.aiclub.platform.dto.AssistantSelectionCard> resolvePreparedSelectionCards(AssistantConversationState existingState,
                                                                                             AssistantChatRequest request) {
        return List.of();
    }

    /**
     * 当前轮次完成后，把用户消息和助手最终回答写回 Redis transcript。
     */
    private FinalizedConversation finalizeConversation(AssistantConversationState latestState,
                                                       AssistantConversationTurn currentUserTurn,
                                                       String assistantContent,
                                                       AssistantChatRequest request,
                                                       AssistantContextAssembler.AssistantConversationContext context) {
        AssistantConversationState workingState = latestState;
        String resolvedContent = assistantContent;
        if (assistantActionFallbackService.shouldFallback(request, assistantContent)) {
            log.info("Assistant fallback activated for question: {}", abbreviate(request == null ? "" : request.question(), 120));
            AssistantActionFallbackService.AssistantFallbackResult fallbackResult = assistantActionFallbackService.tryStartRepositoryScan(latestState, request);
            if (fallbackResult == null) {
                fallbackResult = assistantActionFallbackService.tryReadProjectInfo(latestState, request);
            }
            if (fallbackResult == null) {
                fallbackResult = assistantActionFallbackService.trySearchWorkItems(latestState, request);
            }
            if (fallbackResult == null) {
                fallbackResult = assistantActionFallbackService.tryCreateWorkItemDraft(latestState, request);
            }
            if (fallbackResult != null) {
                log.info("Assistant fallback produced state: actions={}, selections={}",
                        fallbackResult.state().actions().size(),
                        fallbackResult.state().selectionCards().size());
                workingState = fallbackResult.state();
                resolvedContent = fallbackResult.content();
            }
        }
        AssistantResponseMetadata responseMetadata = AssistantResponseMetadata.parse(resolvedContent, objectMapper);
        resolvedContent = AssistantMarkdownFormatter.formatForDisplay(responseMetadata.content());
        List<AssistantConversationTurn> transcript = new ArrayList<>(latestState == null ? List.of() : latestState.transcript());
        transcript.add(currentUserTurn);
        transcript.add(AssistantConversationTurn.assistant(resolvedContent));
        List<AssistantConversationTurn> trimmedTranscript = trimTranscript(transcript);
        List<AssistantSelectionCard> finalSelectionCards = resolveFinalSelectionCards(workingState.selectionCards(), resolvedContent);
        AssistantGroundingState finalGroundingState = finalSelectionCards.isEmpty()
                ? workingState.groundingState().clearPendingSelection()
                : workingState.groundingState();
        AssistantConversationContextState nextContextState = assistantConversationContextService.updateAfterTurn(
                workingState.contextState(),
                currentUserTurn.content(),
                resolvedContent,
                context.projectId(),
                resolveProjectTitle(context)
        );

        AssistantConversationState finalState = new AssistantConversationState(
                workingState.scopeKey(),
                workingState.clientConversationId(),
                workingState.currentUser(),
                AssistantConversationContextSnapshot.fromContext(context),
                workingState.currentRequest(),
                workingState.mcpSessionToken(),
                trimmedTranscript,
                workingState.references() == null || workingState.references().isEmpty() ? context.references() : workingState.references(),
                responseMetadata.suggestions(),
                workingState.actions(),
                finalSelectionCards,
                finalGroundingState,
                workingState.toolExecutions(),
                workingState.lastErrorMessage(),
                workingState.toolExecutionPolicy(),
                nextContextState
        );
        return new FinalizedConversation(finalState, resolvedContent, responseMetadata.title());
    }

    /**
     * 工具执行中可能短暂生成候选卡，但模型最终已经给出完整回答时，不能再把中间候选态暴露给前端。
     * 只有最终话术仍明确要求用户确认候选对象时，才保留卡片等待用户选择。
     */
    private List<AssistantSelectionCard> resolveFinalSelectionCards(List<AssistantSelectionCard> selectionCards,
                                                                 String assistantContent) {
        if (selectionCards == null || selectionCards.isEmpty()) {
            return List.of();
        }
        return isSelectionAwaitingAnswer(assistantContent) ? selectionCards : List.of();
    }

    /**
     * 判断最终回答是否仍停留在“请用户选择候选对象”的状态。
     */
    private boolean isSelectionAwaitingAnswer(String assistantContent) {
        String normalizedContent = defaultString(assistantContent);
        if (normalizedContent.isBlank()) {
            return true;
        }
        if (normalizedContent.contains("指的是哪一个") || normalizedContent.contains("指的是哪个")) {
            return normalizedContent.contains("确认") || normalizedContent.contains("选择") || normalizedContent.contains("选定");
        }
        if (normalizedContent.contains("选择一个")
                || normalizedContent.contains("选一个")
                || normalizedContent.contains("先选定")
                || normalizedContent.contains("先选择")) {
            return normalizedContent.contains("候选")
                    || normalizedContent.contains("对象")
                    || normalizedContent.contains("迭代")
                    || normalizedContent.contains("项目")
                    || normalizedContent.contains("工作项");
        }
        return (normalizedContent.contains("候选") || normalizedContent.contains("卡片"))
                && (normalizedContent.contains("确认")
                || normalizedContent.contains("选择")
                || normalizedContent.contains("选定")
                || normalizedContent.contains("不能确定")
                || normalizedContent.contains("无法确定"));
    }

    /**
     * 构造当前轮次发送给 Assistant 的用户消息。
     * 当本轮来自候选卡片选择时，使用结构化恢复消息替代原始问题，帮助模型理解“你选的是哪个对象”。
     */
    private AssistantConversationTurn buildCurrentUserTurn(AssistantChatRequest request,
                                                         AssistantGroundingState groundingState,
                                                         String attachmentContextMarkdown,
                                                         String fileLibraryEvidenceMarkdown,
                                                         String conversationContextSummary) {
        String content;
        if (request.selection() == null) {
            content = defaultString(request.question());
        } else {
            AssistantGroundingTarget selectedTarget = groundingState == null ? null : groundingState.boundSlot(request.selection().slot());
            if (selectedTarget == null) {
                content = defaultString(request.question());
            } else {
                content = """
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
            }
        }
        content = prependSlashSkillInstruction(content, request, groundingState, fileLibraryEvidenceMarkdown);
        if (conversationContextSummary != null && !conversationContextSummary.isBlank()) {
            content = conversationContextSummary + "\n\n### 本轮用户输入\n" + content;
        }
        if (hasText(attachmentContextMarkdown)) {
            content = """
                    %s

                    以下是当前问题应重点参考的文档提取结果。
                    如果用户是在询问“解释文档内容”“总结附件重点”一类问题，请优先依据下面这些 Markdown 正文回答，而不是只根据文件名猜测：

                    %s
                    """.formatted(content, attachmentContextMarkdown).trim();
        }
        return AssistantConversationTurn.user(content);
    }

    /**
     * Slash Skill 是用户显式选择的专项入口，不能只停留在 system prompt 片段。
     * 这里把选择结果固化到当前轮 user message，保证模型即使面对短输入也会进入对应业务流程。
     */
    private String prependSlashSkillInstruction(String content,
                                                AssistantChatRequest request,
                                                AssistantGroundingState groundingState,
                                                String fileLibraryEvidenceMarkdown) {
        if (request == null || !hasText(request.slashCommand())) {
            return content;
        }
        String slashCommand = request.slashCommand().trim();
        String instruction = switch (slashCommand) {
            case "/文件库" -> buildPersonalFileLibraryInstruction(fileLibraryEvidenceMarkdown);
            case "/仓库扫描" -> buildRepoScanInstruction(groundingState);
            case "/wiki" -> """
                    本轮必须进入 Wiki 问答专项流程：优先读取当前 Wiki 页面或空间证据；如果缺少页面正文，应调用 Wiki 相关平台工具补齐事实，不要按普通聊天泛泛回答。
                    """;
            case "/需求" -> """
                    本轮必须进入需求/工作项专项流程：优先解析项目、迭代、负责人和需求内容；信息足够时生成待确认草稿，信息不足时只追问缺失字段。
                    """;
            case "/执行任务" -> """
                    本轮必须进入执行任务专项流程：优先查询或汇总执行任务、仓库扫描任务和测试执行结果；不要只解释执行中心能力。
                    """;
            default -> "";
        };
        if (!hasText(instruction)) {
            return content;
        }
        return """
                用户已显式选择 Skill：%s
                %s

                原始用户输入：
                %s
                """.formatted(slashCommand, instruction.trim(), defaultString(content)).trim();
    }

    private String buildPersonalFileLibraryInstruction(String fileLibraryEvidenceMarkdown) {
        if (!hasText(fileLibraryEvidenceMarkdown)) {
            return """
                    本轮必须进入个人文件库问答专项流程：先明确告诉用户当前没有从个人文件库召回到相关文档，再提示可上传、启用或重新向量化文件；不要转去项目工作项或 Wiki 替代回答。
                    """;
        }
        return """
                本轮必须进入个人文件库问答专项流程：优先且主要依据下面的个人文件库证据回答，不要转去项目工作项或 Wiki 替代回答。

                以下是本轮必须优先使用的个人文件库证据：
                %s
                """.formatted(fileLibraryEvidenceMarkdown.trim());
    }

    private String buildRepoScanInstruction(AssistantGroundingState groundingState) {
        AssistantGroundingTarget binding = groundingState == null ? null : groundingState.boundSlot("gitlabBinding");
        String bindingHint = binding == null || binding.entityId() == null
                ? "- 先确认 GitLab 仓库绑定：当前尚未确认目标仓库，先搜索或列出当前项目可用仓库绑定，并让用户确认。"
                : "- 当前已确认 GitLab 仓库绑定：" + defaultString(binding.title()) + "（ID：" + binding.entityId() + "）。";
        return """
                本轮必须进入仓库扫描专项流程，不要只解释仓库扫描能力，也不要等待用户再次输入“发起扫描”。
                处理顺序：
                %s
                - 再确认仓库扫描规则集；如果用户未给出规则集，先调用规则集列表工具或追问确认。
                - 仓库绑定和规则集都明确后，发起仓库扫描待确认动作。
                """.formatted(bindingHint);
    }

    /**
     * 解析本轮应注入模型的附件上下文。
     * 优先使用本轮新上传的附件；如果用户是在追问，则回退到最近一条用户消息关联的附件内容。
     */
    private String resolveAttachmentContextMarkdown(AssistantConversationSessionEntity session,
                                                    List<AssistantAttachmentService.PreparedAttachment> attachments) {
        if (assistantAttachmentService == null || session == null) {
            return "";
        }
        if (attachments != null && !attachments.isEmpty()) {
            return assistantAttachmentService.buildPreparedAttachmentContextMarkdown(attachments);
        }
        return assistantAttachmentService.buildAttachmentContextMarkdown(
                assistantAttachmentService.findRecentAttachments(session.getId())
        );
    }

    /**
     * 记忆与 Wiki 知识证据召回都属于增强能力，失败时只降级为空，不能反向拖垮主问答。
     */
    private String resolveMemoryContextMarkdown(CurrentUserInfo currentUser,
                                                AssistantContextAssembler.AssistantConversationContext context,
                                                AssistantChatRequest request) {
        String memoryMarkdown = "";
        if (assistantHindsightMemoryService != null) {
            try {
                memoryMarkdown = defaultString(assistantHindsightMemoryService.buildMemoryContextMarkdown(currentUser, context, request));
            } catch (RuntimeException exception) {
                log.warn("Assistant 组装 Hindsight 记忆上下文失败：{}", resolveErrorMessage(exception));
            }
        }
        String wikiEvidenceMarkdown = "";
        try {
            if (wikiKnowledgeSearchService != null) {
                wikiEvidenceMarkdown = defaultString(wikiKnowledgeSearchService.buildWikiEvidenceMarkdown(currentUser, context, request));
            }
        } catch (RuntimeException exception) {
            log.warn("Assistant 组装 Wiki 知识证据失败：{}", resolveErrorMessage(exception));
        }
        StringBuilder builder = new StringBuilder();
        if (hasText(memoryMarkdown)) {
            builder.append("### Hindsight 记忆\n").append(memoryMarkdown.trim());
        }
        if (hasText(wikiEvidenceMarkdown)) {
            if (!builder.isEmpty()) {
                builder.append("\n\n");
            }
            builder.append("### Wiki 知识证据\n").append(wikiEvidenceMarkdown.trim());
        }
        return builder.toString().trim();
    }

    private String resolveFileLibraryEvidenceMarkdown(CurrentUserInfo currentUser, AssistantChatRequest request) {
        try {
            if (assistantFileLibraryService != null) {
                return defaultString(assistantFileLibraryService.buildEvidenceMarkdown(
                        currentUser,
                        request == null ? "" : request.question()
                ));
            }
        } catch (RuntimeException exception) {
            log.warn("Assistant 组装个人文件库证据失败：{}", resolveErrorMessage(exception));
        }
        return "";
    }

    private String combineMemoryContext(String memoryContextMarkdown, String fileLibraryEvidenceMarkdown) {
        StringBuilder builder = new StringBuilder();
        if (hasText(memoryContextMarkdown)) {
            builder.append(memoryContextMarkdown.trim());
        }
        if (hasText(fileLibraryEvidenceMarkdown)) {
            if (!builder.isEmpty()) {
                builder.append("\n\n");
            }
            builder.append("### 个人文件库证据\n").append(fileLibraryEvidenceMarkdown.trim());
        }
        return builder.toString().trim();
    }

    /**
     * 重新签发当前会话的 MCP 会话令牌。
     */
    private String resolveSessionToken(CurrentUserInfo currentUser,
                                       String scopeKey,
                                       String clientConversationId,
                                       AssistantConversationState existingState) {
        return assistantMcpSessionTokenService.issueToken(currentUser, scopeKey, clientConversationId);
    }

    /**
     * 优先从 Redis 读取最新状态，保证工具调用写回后的结果能够参与当前轮次结束处理。
     */
    private AssistantConversationState loadLatestState(AssistantConversationState preparedState) {
        return assistantConversationStateStore.load(preparedState.scopeKey(), preparedState.clientConversationId())
                .orElse(preparedState);
    }

    /**
     * 裁剪 Redis transcript，避免上下文无限膨胀。
     */
    private List<AssistantConversationTurn> trimTranscript(List<AssistantConversationTurn> transcript) {
        if (transcript == null || transcript.isEmpty()) {
            return List.of();
        }
        int maxMessageCount = Math.max(2, assistantProperties.getMaxContextMessages() * 2);
        if (transcript.size() <= maxMessageCount) {
            return List.copyOf(transcript);
        }
        return List.copyOf(transcript.subList(transcript.size() - maxMessageCount, transcript.size()));
    }

    /**
     * 构造流式首包 meta 事件。
     */
    private AssistantStreamMeta buildMetaEvent(AssistantConversationState state) {
        return new AssistantStreamMeta(
                state.scopeKey(),
                state.context() == null ? "" : defaultString(state.context().roleName()),
                state.references(),
                List.of(),
                state.actions(),
                state.selectionCards(),
                null,
                List.of()
        );
    }

    /**
     * 组装前端调试模式需要的内部执行轨迹。
     */
    private AssistantDebugInfo buildDebugInfo(AssistantConversationState state, String responseId) {
        List<Map<String, Object>> assistantTurns = List.of(Map.of(
                "transport", "chat.completions",
                "responseId", defaultString(responseId),
                "transcriptSize", state == null || state.transcript() == null ? 0 : state.transcript().size(),
                "pendingActions", state == null || state.actions() == null ? 0 : state.actions().size(),
                "pendingSelections", state == null || state.selectionCards() == null ? 0 : state.selectionCards().size()
        ));
        return new AssistantDebugInfo(
                assistantProperties.getModel(),
                "API_SERVER",
                state == null || state.toolExecutions() == null ? 0 : state.toolExecutions().size(),
                assistantTurns,
                toMap(state == null ? AssistantGroundingState.empty() : state.groundingState()),
                toMap(state == null ? AssistantGroundingState.empty() : state.groundingState()),
                state == null ? List.of() : state.toolExecutions(),
                state == null ? "" : defaultString(state.lastErrorMessage())
        );
    }

    /**
     * 将 grounding 状态压平成调试输出友好的键值结构。
     */
    private Map<String, Object> toMap(AssistantGroundingState groundingState) {
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

    /**
     * 写出成功结束事件并更新审计日志。
     */
    private void finishSuccess(OutputStream outputStream,
                               Long sessionId,
                               AssistantChatAuditEntity audit,
                               ChatExecutionResult gatewayResult,
                               FinalizedConversation finalizedConversation,
                               AssistantDebugInfo debugInfo,
                               List<AssistantAttachmentService.PreparedAttachment> attachments,
                               AssistantConversationDetail persistedDetail) {
        audit.setStatus("SUCCESS");
        audit.setResponseSummary(abbreviate(finalizedConversation.content(), 1000));
        audit.setAssistantResponseId(defaultString(gatewayResult.responseId()));
        audit.setFinishedAt(LocalDateTime.now());
        assistantChatAuditRepository.save(audit);

        try {
            writeEvent(outputStream, "done", new AssistantStreamDone(
                    sessionId,
                    resolveMessageId(persistedDetail, "user"),
                    resolveMessageId(persistedDetail, "assistant"),
                    finalizedConversation.state().scopeKey(),
                    finalizedConversation.state().context() == null ? "" : defaultString(finalizedConversation.state().context().roleName()),
                    defaultString(finalizedConversation.content()),
                    finalizedConversation.state().references(),
                    finalizedConversation.state().suggestions(),
                    finalizedConversation.state().actions(),
                    finalizedConversation.state().selectionCards(),
                    null,
                    toAttachmentSummaries(attachments)
            ));
        } catch (AssistantClientStreamDisconnectedException exception) {
            throw exception;
        } catch (IOException exception) {
            throw new AssistantClientStreamDisconnectedException("Assistant 完成事件发送时客户端已断开", exception);
        }
    }

    /** 从持久化详情中提取最近一条指定角色消息 ID，供前端立即挂载反馈控件。 */
    private Long resolveMessageId(AssistantConversationDetail detail, String role) {
        if (detail == null || detail.messages() == null) return null;
        for (int index = detail.messages().size() - 1; index >= 0; index--) {
            AssistantConversationMessageItem message = detail.messages().get(index);
            if (role.equalsIgnoreCase(message.role())) return message.id();
        }
        return null;
    }


    /**
     * 写出失败结束事件并更新审计日志。
     */
    private void finishFailure(OutputStream outputStream, AssistantChatAuditEntity audit, Exception exception) {
        audit.setStatus("FAILED");
        audit.setErrorMessage(abbreviate(resolveErrorMessage(exception), 1000));
        audit.setFinishedAt(LocalDateTime.now());
        assistantChatAuditRepository.save(audit);

        try {
            writeEvent(outputStream, "error", new AssistantStreamError(resolveErrorMessage(exception)));
        } catch (AssistantClientStreamDisconnectedException sendException) {
            throw sendException;
        } catch (IOException sendException) {
            throw new IllegalStateException("Assistant 错误事件发送失败", sendException);
        }
    }

    /**
     * 发送阶段性状态事件。
     */
    private void emitStatus(OutputStream outputStream, String stage, String message) throws IOException {
        writeEvent(outputStream, "status", new AssistantStreamStatus(stage, message));
    }

    /**
     * 将对象序列化为 SSE 事件写回前端。
     */
    private void writeEvent(OutputStream outputStream, String eventName, Object payload) throws IOException {
        String json = objectMapper.writeValueAsString(payload);
        String ssePayload = "event:" + eventName + "\n" + "data:" + json + "\n\n";
        try {
            outputStream.write(ssePayload.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            outputStream.flush();
        } catch (IOException exception) {
            if (isClientStreamDisconnect(exception)) {
                throw new AssistantClientStreamDisconnectedException("Assistant 客户端流式连接已断开", exception);
            }
            throw exception;
        }
    }

    private List<com.aiclub.platform.dto.AssistantAttachmentSummary> toAttachmentSummaries(List<AssistantAttachmentService.PreparedAttachment> attachments) {
        if (attachments == null || attachments.isEmpty()) {
            return List.of();
        }
        return attachments.stream()
                .map(attachment -> new com.aiclub.platform.dto.AssistantAttachmentSummary(
                        null,
                        attachment.asset().getId(),
                        attachment.asset().getFileName(),
                        attachment.asset().getContentType(),
                        attachment.asset().getFileSize(),
                        attachment.asset().getSourceFormat(),
                        attachment.converted().suggestedTitle(),
                        attachment.converted().truncated(),
                        attachment.converted().warnings(),
                        null
                ))
                .toList();
    }

    private List<AssistantAttachmentService.PreparedAttachment> uploadAndConvert(List<org.springframework.web.multipart.MultipartFile> files) {
        if (assistantAttachmentService == null || files == null || files.isEmpty()) {
            return List.of();
        }
        return assistantAttachmentService.uploadAndConvert(files);
    }

    /**
     * 为本轮问答创建一条轻量审计记录。
     */
    private AssistantChatAuditEntity createAudit(CurrentUserInfo currentUser,
                                              AssistantChatRequest request,
                                              AssistantContextAssembler.AssistantConversationContext context,
                                              String scopeKey) {
        AssistantChatAuditEntity entity = new AssistantChatAuditEntity();
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
        return assistantChatAuditRepository.save(entity);
    }

    /**
     * 对会话请求做统一清洗，重点保证 conversationId 永远沿用数据库中保存的稳定标识。
     */
    private AssistantChatRequest resolveEffectiveRequest(AssistantChatRequest request, AssistantConversationSessionEntity session) {
        String sanitizedConversationId = sanitizeConversationId(session.getClientConversationId());
        if (sanitizedConversationId == null || sanitizedConversationId.isBlank()) {
            sanitizedConversationId = "conversation-" + System.currentTimeMillis();
        }
        return new AssistantChatRequest(
                request.question(),
                request.routeName(),
                request.projectId(),
                request.taskId(),
                request.iterationId(),
                request.planId(),
                request.wikiSpaceId(),
                request.wikiPageId(),
                sanitizedConversationId,
                request.selection(),
                null,
                request.slashCommand()
        );
    }

    /**
     * 构造 Redis/MCP 复用的 scopeKey。
     */
    private String resolveScopeKey(Long userId, Long projectId, String clientConversationId) {
        String conversationSuffix = sanitizeConversationId(clientConversationId);
        if (projectId != null) {
            if (conversationSuffix != null) {
                return assistantProperties.getSessionPrefix() + ":project:" + projectId + ":user:" + userId + ":conversation:" + conversationSuffix;
            }
            return assistantProperties.getSessionPrefix() + ":project:" + projectId + ":user:" + userId;
        }
        if (conversationSuffix != null) {
            return assistantProperties.getSessionPrefix() + ":global:user:" + userId + ":conversation:" + conversationSuffix;
        }
        return assistantProperties.getSessionPrefix() + ":global:user:" + userId;
    }

    /**
     * 统一清洗 conversationId 中的非法字符，避免 Redis key 污染。
     */
    private String sanitizeConversationId(String clientConversationId) {
        if (clientConversationId == null || clientConversationId.isBlank()) {
            return null;
        }
        return clientConversationId.trim().replaceAll("[^a-zA-Z0-9:_-]", "");
    }

    /**
     * 为异常场景统一生成对前端友好的错误消息。
     */
    private String resolveErrorMessage(Exception exception) {
        if (exception == null || exception.getMessage() == null || exception.getMessage().isBlank()) {
            return "GitPilot 助手暂时不可用";
        }
        return exception.getMessage().trim();
    }

    /**
     * 安全裁剪字符串长度，避免审计字段超长。
     */
    private String abbreviate(String value, int maxLength) {
        if (value == null || value.length() <= maxLength) {
            return value;
        }
        return value.substring(0, maxLength);
    }

    /**
     * 将可能为空的字符串归一化为非空文本。
     */
    private String defaultString(String value) {
        return value == null ? "" : value.trim();
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private String resolveProjectTitle(AssistantContextAssembler.AssistantConversationContext context) {
        if (context == null || context.references() == null) return "";
        return context.references().stream()
                .filter(reference -> reference != null && "PROJECT".equalsIgnoreCase(defaultString(reference.type())))
                .map(reference -> defaultString(reference.title()))
                .filter(value -> !value.isBlank())
                .findFirst()
                .orElse("");
    }

    /**
     * 首轮回答完成后写入模型生成的会话标题；手动重命名的标题始终优先。
     */
    private void applyGeneratedTitle(AssistantConversationSessionEntity session, String generatedTitle) {
        if (session == null || session.isTitleCustomized() || !"新会话".equals(defaultString(session.getTitle()))) {
            return;
        }
        if (hasText(generatedTitle)) {
            session.setTitle(generatedTitle.trim());
        }
    }

    /**
     * 客户端断开时只在已有工具结果或确认卡片的情况下落库展示态，避免普通生成中断污染会话列表。
     */
    private boolean shouldPersistDisplayStateOnDisconnect(AssistantConversationState state) {
        return state != null
                && ((state.actions() != null && !state.actions().isEmpty())
                || (state.selectionCards() != null && !state.selectionCards().isEmpty())
                || (state.toolExecutions() != null && !state.toolExecutions().isEmpty()));
    }

    private boolean isClientStreamDisconnect(IOException exception) {
        if (exception == null) {
            return false;
        }
        String message = defaultString(exception.getMessage()).toLowerCase(java.util.Locale.ROOT);
        return message.contains("broken pipe")
                || message.contains("connection reset")
                || message.contains("clientabort")
                || message.contains("stream is closed")
                || message.contains("远程主机强迫关闭")
                || message.contains("连接已关闭")
                || message.contains("客户端")
                || message.contains("断开");
    }

    private static class AssistantClientStreamDisconnectedException extends RuntimeException {
        AssistantClientStreamDisconnectedException(String message, Throwable cause) {
            super(message, cause);
        }
    }

    /**
     * 已归档会话只允许查看历史，不允许继续写入新消息。
     */
    private void validateSessionAvailableForChat(AssistantConversationSessionEntity session) {
        if (session != null && session.isArchived()) {
            throw new IllegalArgumentException("已归档会话不能继续发送消息，请先恢复会话");
        }
    }

    /**
     * 一次会话请求准备阶段产生的中间结果。
     */
    private record PreparedConversation(
            AssistantConversationState state,
            AssistantConversationTurn currentUserTurn,
            List<AssistantConversationTurn> outboundTranscript,
            AssistantPromptBuilder.AssistantPrompt prompt
    ) {
    }

    /** Runtime 统一聊天结果，responseId 在非 Legacy Runtime 中由 runId 兼容承载。 */
    private record ChatExecutionResult(String content, String responseId) {
    }

    /**
     * 当前轮次完成后最终写回给前端和 Redis 的结果。
     */
    private record FinalizedConversation(
            AssistantConversationState state,
            String content,
            String autoTitle
    ) {
    }
}
