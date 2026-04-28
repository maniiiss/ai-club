package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.HermesChatAuditEntity;
import com.aiclub.platform.domain.model.HermesConversationSessionEntity;
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
import com.aiclub.platform.dto.request.HermesMultipartChatCommand;
import com.aiclub.platform.dto.request.HermesSessionChatRequest;
import com.aiclub.platform.repository.HermesChatAuditRepository;
import com.aiclub.platform.repository.UserRepository;
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

/**
 * Hermes 会话代理服务。
 * 新版固定采用“数据库会话记录 + Redis 热状态”的双层结构：
 * 数据库负责回显历史记录，Redis 继续承载 Hermes 运行时隐藏记忆与工具链上下文。
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
    private final HermesHindsightMemoryService hermesHindsightMemoryService;
    private final HermesToolOrchestrator hermesToolOrchestrator;
    private final HermesActionFallbackService hermesActionFallbackService;
    private final HermesConversationStateStore hermesConversationStateStore;
    private final HermesMcpSessionTokenService hermesMcpSessionTokenService;
    private final HermesChatAuditRepository hermesChatAuditRepository;
    private final HermesConversationSessionService hermesConversationSessionService;
    private final HermesAttachmentService hermesAttachmentService;
    private final ObjectMapper objectMapper;

    @Autowired
    public HermesChatService(AuthService authService,
                             UserRepository userRepository,
                             HermesProperties hermesProperties,
                             HermesContextAssembler hermesContextAssembler,
                             HermesPromptBuilder hermesPromptBuilder,
                             HermesGatewayService hermesGatewayService,
                             HermesHindsightMemoryService hermesHindsightMemoryService,
                             HermesToolOrchestrator hermesToolOrchestrator,
                             HermesActionFallbackService hermesActionFallbackService,
                             HermesConversationStateStore hermesConversationStateStore,
                             HermesMcpSessionTokenService hermesMcpSessionTokenService,
                             HermesChatAuditRepository hermesChatAuditRepository,
                             HermesConversationSessionService hermesConversationSessionService,
                             HermesAttachmentService hermesAttachmentService,
                             ObjectMapper objectMapper) {
        this.authService = authService;
        this.userRepository = userRepository;
        this.hermesProperties = hermesProperties;
        this.hermesContextAssembler = hermesContextAssembler;
        this.hermesPromptBuilder = hermesPromptBuilder;
        this.hermesGatewayService = hermesGatewayService;
        this.hermesHindsightMemoryService = hermesHindsightMemoryService;
        this.hermesToolOrchestrator = hermesToolOrchestrator;
        this.hermesActionFallbackService = hermesActionFallbackService;
        this.hermesConversationStateStore = hermesConversationStateStore;
        this.hermesMcpSessionTokenService = hermesMcpSessionTokenService;
        this.hermesChatAuditRepository = hermesChatAuditRepository;
        this.hermesConversationSessionService = hermesConversationSessionService;
        this.hermesAttachmentService = hermesAttachmentService;
        this.objectMapper = objectMapper;
    }

    /**
     * 兼容旧测试构造方式。
     */
    public HermesChatService(AuthService authService,
                             UserRepository userRepository,
                             HermesProperties hermesProperties,
                             HermesContextAssembler hermesContextAssembler,
                             HermesPromptBuilder hermesPromptBuilder,
                             HermesGatewayService hermesGatewayService,
                             HermesHindsightMemoryService hermesHindsightMemoryService,
                             HermesToolOrchestrator hermesToolOrchestrator,
                             HermesActionFallbackService hermesActionFallbackService,
                             HermesConversationStateStore hermesConversationStateStore,
                             HermesMcpSessionTokenService hermesMcpSessionTokenService,
                             HermesChatAuditRepository hermesChatAuditRepository,
                             HermesConversationSessionService hermesConversationSessionService,
                             ObjectMapper objectMapper) {
        this(authService, userRepository, hermesProperties, hermesContextAssembler, hermesPromptBuilder, hermesGatewayService,
                hermesHindsightMemoryService, hermesToolOrchestrator, hermesActionFallbackService, hermesConversationStateStore, hermesMcpSessionTokenService,
                hermesChatAuditRepository, hermesConversationSessionService, null, objectMapper);
    }

    /**
     * 基于指定会话执行流式聊天。
     */
    public StreamingResponseBody streamChat(Long sessionId, HermesSessionChatRequest request) {
        return streamChatInternal(sessionId, request, List.of());
    }

    /**
     * 基于指定会话执行带附件的流式聊天。
     */
    public StreamingResponseBody streamChat(Long sessionId, HermesMultipartChatCommand command) {
        return streamChatInternal(
                sessionId,
                new HermesSessionChatRequest(command.question(), command.selection(), command.debug()),
                uploadAndConvert(command.files())
        );
    }

    private StreamingResponseBody streamChatInternal(Long sessionId,
                                                     HermesSessionChatRequest request,
                                                     List<HermesAttachmentService.PreparedAttachment> attachments) {
        HermesConversationSessionEntity session = hermesConversationSessionService.requireOwnedSession(sessionId);
        validateSessionAvailableForChat(session);
        CurrentUserInfo currentUser = authService.currentUser();
        HermesChatRequest boundRequest = buildBoundRequest(session, request);
        HermesContextAssembler.HermesConversationContext context = hermesContextAssembler.assemble(boundRequest, currentUser);
        HermesChatRequest effectiveRequest = resolveEffectiveRequest(boundRequest, session);
        String scopeKey = resolveScopeKey(currentUser.id(), context.projectId(), effectiveRequest.clientConversationId());
        HermesChatAuditEntity audit = createAudit(currentUser, effectiveRequest, context, scopeKey);
        String attachmentContextMarkdown = resolveAttachmentContextMarkdown(session, attachments);
        PreparedConversation preparedConversation = prepareConversation(currentUser, context, effectiveRequest, scopeKey, attachmentContextMarkdown);

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
                HermesDebugInfo debugInfo = buildDebugInfo(finalizedConversation.state(), gatewayResult.responseId());
                hermesConversationSessionService.recordSuccess(
                        session,
                        effectiveRequest,
                        finalizedConversation.state(),
                        finalizedConversation.content(),
                        debugInfo,
                        attachments
                );
                hermesHindsightMemoryService.retainConversationTurnAsync(
                        currentUser,
                        session,
                        context,
                        effectiveRequest,
                        finalizedConversation.content(),
                        finalizedConversation.state()
                );
                finishSuccess(outputStream, audit, gatewayResult, finalizedConversation, debugInfo, attachments);
            } catch (Exception exception) {
                HermesConversationState latestState = loadLatestState(preparedConversation.state());
                HermesDebugInfo debugInfo = buildDebugInfo(latestState, "");
                hermesConversationSessionService.recordFailure(
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
    public HermesChatResponse chat(Long sessionId, HermesSessionChatRequest request) {
        return chatInternal(sessionId, request, List.of());
    }

    /**
     * 基于指定会话执行带附件的非流式聊天。
     */
    public HermesChatResponse chat(Long sessionId, HermesMultipartChatCommand command) {
        return chatInternal(
                sessionId,
                new HermesSessionChatRequest(command.question(), command.selection(), command.debug()),
                uploadAndConvert(command.files())
        );
    }

    private HermesChatResponse chatInternal(Long sessionId,
                                            HermesSessionChatRequest request,
                                            List<HermesAttachmentService.PreparedAttachment> attachments) {
        HermesConversationSessionEntity session = hermesConversationSessionService.requireOwnedSession(sessionId);
        validateSessionAvailableForChat(session);
        CurrentUserInfo currentUser = authService.currentUser();
        HermesChatRequest boundRequest = buildBoundRequest(session, request);
        HermesContextAssembler.HermesConversationContext context = hermesContextAssembler.assemble(boundRequest, currentUser);
        HermesChatRequest effectiveRequest = resolveEffectiveRequest(boundRequest, session);
        String scopeKey = resolveScopeKey(currentUser.id(), context.projectId(), effectiveRequest.clientConversationId());
        HermesChatAuditEntity audit = createAudit(currentUser, effectiveRequest, context, scopeKey);
        String attachmentContextMarkdown = resolveAttachmentContextMarkdown(session, attachments);
        PreparedConversation preparedConversation = prepareConversation(currentUser, context, effectiveRequest, scopeKey, attachmentContextMarkdown);

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
            HermesDebugInfo debugInfo = buildDebugInfo(finalizedConversation.state(), gatewayResult.responseId());
            hermesConversationSessionService.recordSuccess(
                    session,
                    effectiveRequest,
                    finalizedConversation.state(),
                    finalizedConversation.content(),
                    debugInfo,
                    attachments
            );
            hermesHindsightMemoryService.retainConversationTurnAsync(
                    currentUser,
                    session,
                    context,
                    effectiveRequest,
                    finalizedConversation.content(),
                    finalizedConversation.state()
            );

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
                    debugInfo,
                    toAttachmentSummaries(attachments)
            );
        } catch (Exception exception) {
            HermesConversationState latestState = loadLatestState(preparedConversation.state());
            HermesDebugInfo debugInfo = buildDebugInfo(latestState, "");
            hermesConversationSessionService.recordFailure(
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
            hermesChatAuditRepository.save(audit);
            throw exception;
        }
    }

    /**
     * 将已持久化会话绑定信息与本轮聊天输入合并成 Hermes 真实请求。
     * 这里的关键点是：继续聊天时始终以会话创建时的上下文为准，而不是当前页面上下文。
     */
    private HermesChatRequest buildBoundRequest(HermesConversationSessionEntity session, HermesSessionChatRequest request) {
        return new HermesChatRequest(
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
                request.debug()
        );
    }

    /**
     * 准备当前轮次的会话态、提示词和待发送 transcript。
     * 复杂之处在于：要先把新的页面上下文和 selection 合并进 Redis，会话工具调用期间 backend 才能拿到最新状态。
     */
    private PreparedConversation prepareConversation(CurrentUserInfo currentUser,
                                                     HermesContextAssembler.HermesConversationContext context,
                                                     HermesChatRequest request,
                                                     String scopeKey,
                                                     String attachmentContextMarkdown) {
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
                existingState == null ? List.of() : existingState.actions(),
                resolvePreparedSelectionCards(existingState, request),
                groundingState,
                existingState == null ? List.of() : existingState.toolExecutions(),
                existingState == null ? "" : existingState.lastErrorMessage()
        );
        hermesConversationStateStore.save(preparedState);

        HermesConversationTurn currentUserTurn = buildCurrentUserTurn(request, groundingState, attachmentContextMarkdown);
        String memoryContextMarkdown = resolveMemoryContextMarkdown(currentUser, context, request);
        HermesPromptBuilder.HermesPrompt prompt = hermesPromptBuilder.buildConversationPrompt(
                currentUser,
                context,
                request,
                groundingState,
                sessionToken,
                currentUserTurn.content(),
                memoryContextMarkdown
        );

        return new PreparedConversation(
                preparedState,
                currentUserTurn,
                trimTranscript(preparedState.transcript()),
                prompt
        );
    }

    /**
     * 用户已经在候选卡片中完成确认后，本轮展示态不应继续回显上一轮的待确认卡片。
     * 否则前端会在 selection 请求发出后被旧 meta/done 事件重新刷回“需要确认”区块。
     */
    private List<com.aiclub.platform.dto.HermesSelectionCard> resolvePreparedSelectionCards(HermesConversationState existingState,
                                                                                             HermesChatRequest request) {
        if (request != null && request.selection() != null) {
            return List.of();
        }
        return existingState == null ? List.of() : existingState.selectionCards();
    }

    /**
     * 当前轮次完成后，把用户消息和助手最终回答写回 Redis transcript。
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
    private HermesConversationTurn buildCurrentUserTurn(HermesChatRequest request,
                                                        HermesGroundingState groundingState,
                                                        String attachmentContextMarkdown) {
        String content;
        if (request.selection() == null) {
            content = defaultString(request.question());
        } else {
            HermesGroundingTarget selectedTarget = groundingState == null ? null : groundingState.boundSlot(request.selection().slot());
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
        if (hasText(attachmentContextMarkdown)) {
            content = """
                    %s

                    以下是当前问题应重点参考的文档提取结果。
                    如果用户是在询问“解释文档内容”“总结附件重点”一类问题，请优先依据下面这些 Markdown 正文回答，而不是只根据文件名猜测：

                    %s
                    """.formatted(content, attachmentContextMarkdown).trim();
        }
        return HermesConversationTurn.user(content);
    }

    /**
     * 解析本轮应注入模型的附件上下文。
     * 优先使用本轮新上传的附件；如果用户是在追问，则回退到最近一条用户消息关联的附件内容。
     */
    private String resolveAttachmentContextMarkdown(HermesConversationSessionEntity session,
                                                    List<HermesAttachmentService.PreparedAttachment> attachments) {
        if (hermesAttachmentService == null || session == null) {
            return "";
        }
        if (attachments != null && !attachments.isEmpty()) {
            return hermesAttachmentService.buildPreparedAttachmentContextMarkdown(attachments);
        }
        return hermesAttachmentService.buildAttachmentContextMarkdown(
                hermesAttachmentService.findRecentAttachments(session.getId())
        );
    }

    /**
     * 记忆召回属于增强能力，失败时只降级为空，不能反向拖垮主问答。
     */
    private String resolveMemoryContextMarkdown(CurrentUserInfo currentUser,
                                                HermesContextAssembler.HermesConversationContext context,
                                                HermesChatRequest request) {
        if (hermesHindsightMemoryService == null) {
            return "";
        }
        try {
            return defaultString(hermesHindsightMemoryService.buildMemoryContextMarkdown(currentUser, context, request));
        } catch (RuntimeException exception) {
            log.warn("Hermes 组装 Hindsight 记忆上下文失败：{}", resolveErrorMessage(exception));
            return "";
        }
    }

    /**
     * 重新签发当前会话的 MCP 会话令牌。
     */
    private String resolveSessionToken(CurrentUserInfo currentUser,
                                       String scopeKey,
                                       String clientConversationId,
                                       HermesConversationState existingState) {
        return hermesMcpSessionTokenService.issueToken(currentUser, scopeKey, clientConversationId);
    }

    /**
     * 优先从 Redis 读取最新状态，保证工具调用写回后的结果能够参与当前轮次结束处理。
     */
    private HermesConversationState loadLatestState(HermesConversationState preparedState) {
        return hermesConversationStateStore.load(preparedState.scopeKey(), preparedState.clientConversationId())
                .orElse(preparedState);
    }

    /**
     * 裁剪 Redis transcript，避免上下文无限膨胀。
     */
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

    /**
     * 构造流式首包 meta 事件。
     */
    private HermesStreamMeta buildMetaEvent(HermesConversationState state) {
        return new HermesStreamMeta(
                state.scopeKey(),
                state.context() == null ? "" : defaultString(state.context().roleName()),
                state.references(),
                state.suggestions(),
                state.actions(),
                state.selectionCards(),
                buildDebugInfo(state, ""),
                List.of()
        );
    }

    /**
     * 组装前端调试模式需要的内部执行轨迹。
     */
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

    /**
     * 将 grounding 状态压平成调试输出友好的键值结构。
     */
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

    /**
     * 写出成功结束事件并更新审计日志。
     */
    private void finishSuccess(OutputStream outputStream,
                               HermesChatAuditEntity audit,
                               HermesGatewayService.HermesGatewayResult gatewayResult,
                               FinalizedConversation finalizedConversation,
                               HermesDebugInfo debugInfo,
                               List<HermesAttachmentService.PreparedAttachment> attachments) {
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
                    debugInfo,
                    toAttachmentSummaries(attachments)
            ));
        } catch (IOException exception) {
            throw new IllegalStateException("Hermes 完成事件发送失败", exception);
        }
    }

    /**
     * 写出失败结束事件并更新审计日志。
     */
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

    /**
     * 发送阶段性状态事件。
     */
    private void emitStatus(OutputStream outputStream, String stage, String message) throws IOException {
        writeEvent(outputStream, "status", new HermesStreamStatus(stage, message));
    }

    /**
     * 将对象序列化为 SSE 事件写回前端。
     */
    private void writeEvent(OutputStream outputStream, String eventName, Object payload) throws IOException {
        String json = objectMapper.writeValueAsString(payload);
        String ssePayload = "event:" + eventName + "\n" + "data:" + json + "\n\n";
        outputStream.write(ssePayload.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        outputStream.flush();
    }

    private List<com.aiclub.platform.dto.HermesAttachmentSummary> toAttachmentSummaries(List<HermesAttachmentService.PreparedAttachment> attachments) {
        if (attachments == null || attachments.isEmpty()) {
            return List.of();
        }
        return attachments.stream()
                .map(attachment -> new com.aiclub.platform.dto.HermesAttachmentSummary(
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

    private List<HermesAttachmentService.PreparedAttachment> uploadAndConvert(List<org.springframework.web.multipart.MultipartFile> files) {
        if (hermesAttachmentService == null || files == null || files.isEmpty()) {
            return List.of();
        }
        return hermesAttachmentService.uploadAndConvert(files);
    }

    /**
     * 为本轮问答创建一条轻量审计记录。
     */
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

    /**
     * 对会话请求做统一清洗，重点保证 conversationId 永远沿用数据库中保存的稳定标识。
     */
    private HermesChatRequest resolveEffectiveRequest(HermesChatRequest request, HermesConversationSessionEntity session) {
        String sanitizedConversationId = sanitizeConversationId(session.getClientConversationId());
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
                request.wikiSpaceId(),
                request.wikiPageId(),
                sanitizedConversationId,
                request.selection(),
                request.debug()
        );
    }

    /**
     * 构造 Redis/MCP 复用的 scopeKey。
     */
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
            return "Hermes 助手暂时不可用";
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

    /**
     * 已归档会话只允许查看历史，不允许继续写入新消息。
     */
    private void validateSessionAvailableForChat(HermesConversationSessionEntity session) {
        if (session != null && session.isArchived()) {
            throw new IllegalArgumentException("已归档会话不能继续发送消息，请先恢复会话");
        }
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
