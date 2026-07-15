package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.AssistantConversationMessageEntity;
import com.aiclub.platform.domain.model.AssistantConversationSessionEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.CurrentUserInfo;
import com.aiclub.platform.dto.AssistantConversationDetail;
import com.aiclub.platform.dto.AssistantConversationMessageItem;
import com.aiclub.platform.dto.AssistantConversationSessionSummary;
import com.aiclub.platform.dto.AssistantConversationSearchResult;
import com.aiclub.platform.dto.AssistantDebugInfo;
import com.aiclub.platform.dto.AssistantLatestDisplayState;
import com.aiclub.platform.dto.AssistantConversationState;
import com.aiclub.platform.dto.AssistantConversationContextState;
import com.aiclub.platform.dto.AssistantConversationTurn;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.request.CreateAssistantConversationSessionRequest;
import com.aiclub.platform.dto.request.AssistantChatRequest;
import com.aiclub.platform.service.AssistantAttachmentService.PreparedAttachment;
import com.aiclub.platform.dto.request.RenameAssistantConversationSessionRequest;
import com.aiclub.platform.runtime.CompactionStrategy;
import com.aiclub.platform.runtime.RuntimeContextProfile;
import com.aiclub.platform.repository.AssistantConversationMessageRepository;
import com.aiclub.platform.repository.AssistantConversationSessionRepository;
import com.aiclub.platform.repository.UserRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.UUID;

/**
 * 统一负责 Assistant 云端会话记录的增删改查与消息持久化。
 */
@Service
@Transactional(readOnly = true)
public class AssistantConversationSessionService {

    /** GitPilot 新会话默认 Runtime；现有 Assistant 会话仍按历史快照执行。 */
    @Value("${platform.assistant.default-runtime-code:HERMES_LEGACY}")
    private String defaultRuntimeCode;

    /** Runtime 管理页的助手场景默认值；为空时保留环境变量兼容回退。 */
    @Autowired(required = false)
    private RuntimeScenarioDefaultService runtimeScenarioDefaultService;

    /** Runtime Registry 是新会话上下文预算的权威配置源。 */
    @Autowired(required = false)
    private RuntimeRegistryService runtimeRegistryService;

    /** 新建会话的默认标题。 */
    private static final String DEFAULT_SESSION_TITLE = "新会话";

    /** 会话标题最大长度。 */
    private static final int MAX_TITLE_LENGTH = 100;

    /** 会话列表预览最大长度。 */
    private static final int MAX_PREVIEW_LENGTH = 500;

    /** 会话时间统一输出格式。 */
    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    /** 公众端纯聊天页使用的全局会话过滤标记。 */
    private static final String SESSION_SCOPE_GLOBAL = "GLOBAL";

    /** 公众端项目浮标使用的项目会话过滤标记。 */
    private static final String SESSION_SCOPE_PROJECT = "PROJECT";

    /** 兼容管理端和旧调用方的全部会话过滤标记。 */
    private static final String SESSION_SCOPE_ALL = "ALL";

    private final AuthService authService;
    private final UserRepository userRepository;
    private final AssistantConversationSessionRepository assistantConversationSessionRepository;
    private final AssistantConversationMessageRepository assistantConversationMessageRepository;
    private final AssistantAttachmentService assistantAttachmentService;
    private final ObjectMapper objectMapper;

    @Autowired
    public AssistantConversationSessionService(AuthService authService,
                                           UserRepository userRepository,
                                           AssistantConversationSessionRepository assistantConversationSessionRepository,
                                           AssistantConversationMessageRepository assistantConversationMessageRepository,
                                           AssistantAttachmentService assistantAttachmentService,
                                           ObjectMapper objectMapper) {
        this.authService = authService;
        this.userRepository = userRepository;
        this.assistantConversationSessionRepository = assistantConversationSessionRepository;
        this.assistantConversationMessageRepository = assistantConversationMessageRepository;
        this.assistantAttachmentService = assistantAttachmentService;
        this.objectMapper = objectMapper;
    }

    /**
     * 兼容旧测试构造方式。
     */
    public AssistantConversationSessionService(AuthService authService,
                                           UserRepository userRepository,
                                           AssistantConversationSessionRepository assistantConversationSessionRepository,
                                           AssistantConversationMessageRepository assistantConversationMessageRepository,
                                           ObjectMapper objectMapper) {
        this(authService, userRepository, assistantConversationSessionRepository, assistantConversationMessageRepository, null, objectMapper);
    }

    /**
     * 创建一条绑定当前页面上下文的空会话。
     * 如果当前用户已有未使用的会话（没有任何消息），则复用该会话而不是创建新的。
     */
    @Transactional
    public AssistantConversationSessionSummary createSession(CreateAssistantConversationSessionRequest request) {
        CurrentUserInfo currentUser = authService.currentUser();
        UserEntity userEntity = userRepository.findById(currentUser.id())
                .orElseThrow(() -> new NoSuchElementException("当前用户不存在"));

        // 检查完全相同上下文下是否有未使用的会话（没有消息的会话）。
        // 业务意图：纯聊天页和项目浮标都可能先创建空会话，复用时必须按上下文隔离。
        List<AssistantConversationSessionEntity> unusedSessions = assistantConversationSessionRepository
                .findUnusedSessionByContext(
                        currentUser.id(),
                        defaultString(request.routeName()),
                        request.projectId(),
                        request.taskId(),
                        request.iterationId(),
                        request.planId(),
                        request.wikiSpaceId(),
                        request.wikiPageId()
                );

        if (!unusedSessions.isEmpty()) {
            // 如果有同上下文未使用的会话，直接复用，避免重复创建空会话。
            return toSummary(unusedSessions.get(0));
        }

        // 如果没有未使用的会话，创建新会话
        AssistantConversationSessionEntity entity = new AssistantConversationSessionEntity();
        entity.setUser(userEntity);
        entity.setTitle(DEFAULT_SESSION_TITLE);
        entity.setTitleCustomized(false);
        entity.setClientConversationId(generateClientConversationId());
        entity.setRouteName(defaultString(request.routeName()));
        entity.setRuntimeRegistryCode(resolveAssistantRuntimeCode());
        entity.setRuntimeProfileVersion(1L);
        entity.setRuntimeContextProfileSnapshotJson(writeRuntimeContextProfile(
                resolveRuntimeContextProfile(entity.getRuntimeRegistryCode())));
        entity.setProjectId(request.projectId());
        entity.setTaskId(request.taskId());
        entity.setIterationId(request.iterationId());
        entity.setPlanId(request.planId());
        entity.setWikiSpaceId(request.wikiSpaceId());
        entity.setWikiPageId(request.wikiPageId());
        entity.setLatestPreview("");
        entity.setLatestDisplayStateJson(writeLatestDisplayState(AssistantLatestDisplayState.empty()));
        AssistantConversationSessionEntity saved = assistantConversationSessionRepository.save(entity);
        return toSummary(saved);
    }

    /** 新会话实时读取管理端配置，兼容尚未执行 V129 的旧测试和旧数据库。 */
    private String resolveAssistantRuntimeCode() {
        if (runtimeScenarioDefaultService != null) {
            return runtimeScenarioDefaultService.resolve(RuntimeScenarioDefaultService.SCENARIO_ASSISTANT);
        }
        return defaultRuntimeCode == null || defaultRuntimeCode.isBlank()
                ? "HERMES_LEGACY" : defaultRuntimeCode.trim().toUpperCase(java.util.Locale.ROOT);
    }

    /** 读取会话创建时的上下文预算快照；旧会话没有快照时回退到当前 Registry 配置。 */
    public RuntimeContextProfile resolveRuntimeContextProfile(AssistantConversationSessionEntity session) {
        if (session != null && defaultString(session.getRuntimeContextProfileSnapshotJson()).length() > 2) {
            try {
                return objectMapper.readValue(session.getRuntimeContextProfileSnapshotJson(), RuntimeContextProfile.class);
            } catch (Exception ignored) {
                // 历史会话快照损坏时继续走当前 Runtime 默认配置，避免阻断续聊。
            }
        }
        String runtimeCode = session == null ? resolveAssistantRuntimeCode() : session.getRuntimeRegistryCode();
        return resolveRuntimeContextProfile(runtimeCode);
    }

    private RuntimeContextProfile resolveRuntimeContextProfile(String runtimeCode) {
        if (runtimeRegistryService == null) {
            return RuntimeContextProfile.defaults();
        }
        try {
            return runtimeRegistryService.contextProfile(runtimeCode);
        } catch (Exception ignored) {
            return RuntimeContextProfile.defaults();
        }
    }

    private String writeRuntimeContextProfile(RuntimeContextProfile profile) {
        try {
            return objectMapper.writeValueAsString(profile == null ? RuntimeContextProfile.defaults() : profile);
        } catch (JsonProcessingException exception) {
            return "{}";
        }
    }

    /**
     * 分页读取当前用户的会话列表。
     */
    public PageResponse<AssistantConversationSessionSummary> pageSessions(int page, int size, boolean archived) {
        return pageSessions(page, size, archived, SESSION_SCOPE_ALL, null);
    }

    /**
     * 按公众端会话作用域分页读取当前用户的会话列表。
     * scope=GLOBAL 用于纯聊天页，scope=PROJECT 用于项目浮标，scope=ALL 保持旧管理端行为。
     */
    public PageResponse<AssistantConversationSessionSummary> pageSessions(int page,
                                                                       int size,
                                                                       boolean archived,
                                                                       String scope,
                                                                       Long projectId) {
        CurrentUserInfo currentUser = authService.currentUser();
        Pageable pageable = PageRequest.of(
                Math.max(page, 1) - 1,
                Math.max(1, Math.min(size, 100)),
                Sort.by(Sort.Direction.DESC, "lastMessageAt").and(Sort.by(Sort.Direction.DESC, "id"))
        );
        String normalizedScope = normalizeSessionScope(scope);
        Page<AssistantConversationSessionEntity> entityPage;
        if (SESSION_SCOPE_GLOBAL.equals(normalizedScope)) {
            entityPage = assistantConversationSessionRepository.findGlobalSessions(currentUser.id(), archived, pageable);
        } else if (SESSION_SCOPE_PROJECT.equals(normalizedScope)) {
            if (projectId == null) {
                throw new IllegalArgumentException("项目会话列表需要提供 projectId");
            }
            entityPage = assistantConversationSessionRepository.findByUser_IdAndArchivedAndProjectId(
                    currentUser.id(),
                    archived,
                    projectId,
                    pageable
            );
        } else {
            entityPage = assistantConversationSessionRepository.findByUser_IdAndArchived(currentUser.id(), archived, pageable);
        }
        Page<AssistantConversationSessionSummary> pageData = entityPage.map(this::toSummary);
        return PageResponse.from(pageData);
    }

    /**
     * 搜索当前项目下当前用户的活跃和已归档会话消息。
     */
    @Transactional(readOnly = true)
    public PageResponse<AssistantConversationSearchResult> searchProjectSessions(int page,
                                                                                   int size,
                                                                                   Long projectId,
                                                                                   String query,
                                                                                   boolean includeArchived) {
        if (projectId == null) {
            throw new IllegalArgumentException("搜索项目会话需要提供 projectId");
        }
        String normalizedQuery = defaultString(query);
        if (normalizedQuery.isBlank()) {
            return new PageResponse<>(List.of(), 0, 1, Math.max(1, Math.min(size, 50)), 0);
        }
        CurrentUserInfo currentUser = authService.currentUser();
        Pageable pageable = PageRequest.of(
                Math.max(page, 1) - 1,
                Math.max(1, Math.min(size, 50)),
                Sort.by(Sort.Direction.DESC, "lastMessageAt").and(Sort.by(Sort.Direction.DESC, "id"))
        );
        Page<AssistantConversationSessionEntity> entityPage = assistantConversationSessionRepository.searchProjectSessions(
                currentUser.id(), projectId, normalizedQuery, includeArchived, pageable
        );
        Page<AssistantConversationSearchResult> resultPage = entityPage.map(session -> toSearchResult(session, normalizedQuery));
        return PageResponse.from(resultPage);
    }

    /**
     * 读取当前用户指定会话的完整详情与历史消息。
     */
    public AssistantConversationDetail getSessionDetail(Long sessionId) {
        AssistantConversationSessionEntity session = requireOwnedSession(sessionId);
        return buildDetail(session);
    }

    /**
     * 重命名当前用户拥有的会话。
     */
    @Transactional
    public AssistantConversationSessionSummary renameSession(Long sessionId, RenameAssistantConversationSessionRequest request) {
        AssistantConversationSessionEntity session = requireOwnedSession(sessionId);
        session.setTitle(trimToMaxLength(defaultString(request.title()), MAX_TITLE_LENGTH));
        session.setTitleCustomized(true);
        return toSummary(assistantConversationSessionRepository.save(session));
    }

    /**
     * 归档当前用户拥有的会话。
     */
    @Transactional
    public AssistantConversationSessionSummary archiveSession(Long sessionId) {
        AssistantConversationSessionEntity session = requireOwnedSession(sessionId);
        session.setArchived(true);
        session.setArchivedAt(LocalDateTime.now());
        return toSummary(assistantConversationSessionRepository.save(session));
    }

    /**
     * 恢复当前用户已归档的会话。
     */
    @Transactional
    public AssistantConversationSessionSummary restoreSession(Long sessionId) {
        AssistantConversationSessionEntity session = requireOwnedSession(sessionId);
        session.setArchived(false);
        session.setArchivedAt(null);
        return toSummary(assistantConversationSessionRepository.save(session));
    }

    /**
     * 删除当前用户拥有的会话及其全部消息记录。
     * 这里采用物理删除，依赖数据库外键级联清理消息表。
     */
    @Transactional
    public void deleteSession(Long sessionId) {
        AssistantConversationSessionEntity session = requireOwnedSession(sessionId);
        assistantConversationSessionRepository.delete(session);
    }

    /**
     * 校验并返回当前用户拥有的会话实体。
     */
    public AssistantConversationSessionEntity requireOwnedSession(Long sessionId) {
        CurrentUserInfo currentUser = authService.currentUser();
        return assistantConversationSessionRepository.findByIdAndUser_Id(sessionId, currentUser.id())
                .orElseThrow(() -> new NoSuchElementException("GitPilot 会话不存在"));
    }

    /**
     * 聊天成功后，持久化本轮用户消息、助手回答和最新展示态。
     */
    @Transactional
    public AssistantConversationDetail recordSuccess(AssistantConversationSessionEntity session,
                                                  AssistantChatRequest request,
                                                  AssistantConversationState finalState,
                                                  String assistantContent,
                                                  AssistantDebugInfo debugInfo,
                                                  List<PreparedAttachment> attachments) {
        if (session.isArchived()) {
            throw new IllegalArgumentException("已归档会话不能继续发送消息，请先恢复会话");
        }

        boolean shouldAutoTitle = !session.isTitleCustomized() && isDefaultTitle(session.getTitle());
        AssistantConversationMessageEntity userMessage = persistMessage(session, "user", buildDisplayedUserMessage(request), "DONE");
        if (assistantAttachmentService != null) {
            assistantAttachmentService.bindToUserMessage(userMessage, attachments);
        }
        persistMessage(session, "assistant", defaultString(assistantContent), "DONE");

        if (shouldAutoTitle && hasText(request.question())) {
            session.setTitle(buildAutoTitle(request.question()));
        }

        session.setLatestPreview(resolveLatestPreview(assistantContent, request.question()));
        session.setLatestDisplayStateJson(writeLatestDisplayState(buildLatestDisplayState(finalState)));
        persistContextState(session, finalState == null ? AssistantConversationContextState.empty() : finalState.contextState());
        session.setLastMessageAt(LocalDateTime.now());
        AssistantConversationSessionEntity saved = assistantConversationSessionRepository.save(session);
        return buildDetail(saved);
    }

    /**
     * 兼容旧调用方：未提供附件时按空列表处理。
     */
    @Transactional
    public AssistantConversationDetail recordSuccess(AssistantConversationSessionEntity session,
                                                  AssistantChatRequest request,
                                                  AssistantConversationState finalState,
                                                  String assistantContent,
                                                  AssistantDebugInfo debugInfo) {
        return recordSuccess(session, request, finalState, assistantContent, debugInfo, List.of());
    }

    /** 从数据库恢复 Redis 过期后的摘要、事实和待确认状态。 */
    public AssistantConversationContextState readContextState(AssistantConversationSessionEntity session) {
        if (session == null) return AssistantConversationContextState.empty();
        Map<String, Object> facts = Map.of();
        try {
            if (hasText(session.getContextFactsJson())) {
                facts = objectMapper.readValue(session.getContextFactsJson(), Map.class);
            }
        } catch (Exception ignored) {
            // 损坏的辅助上下文不应阻断原始消息续聊。
        }
        return new AssistantConversationContextState(
                defaultString(session.getContextSummary()), facts,
                defaultString(session.getPendingClarificationJson()),
                session.getEstimatedContextTokens() == null ? 0 : session.getEstimatedContextTokens(),
                session.getSummaryThroughMessageId() == null ? 0 : session.getSummaryThroughMessageId(),
                session.getContextVersion() == null ? 0 : session.getContextVersion()
        );
    }

    /**
     * Redis 热状态过期或换设备后，从数据库恢复完整原始消息。
     * 业务意图：数据库消息是长对话的最终事实来源，恢复后再由 Context Service 按会话快照裁剪，不能只恢复摘要。
     */
    public List<AssistantConversationTurn> readTranscript(AssistantConversationSessionEntity session) {
        if (session == null || session.getId() == null) {
            return List.of();
        }
        return assistantConversationMessageRepository.findBySession_IdOrderByCreatedAtAscIdAsc(session.getId()).stream()
                .filter(message -> "user".equalsIgnoreCase(defaultString(message.getRole())
                        ) || "assistant".equalsIgnoreCase(defaultString(message.getRole()))
                        || "toolResult".equalsIgnoreCase(defaultString(message.getRole())))
                .map(message -> new AssistantConversationTurn(
                        defaultString(message.getRole()).toLowerCase(java.util.Locale.ROOT),
                        defaultString(message.getContent())))
                .toList();
    }

    private void persistContextState(AssistantConversationSessionEntity session,
                                     AssistantConversationContextState state) {
        AssistantConversationContextState resolved = state == null
                ? AssistantConversationContextState.empty() : state;
        session.setContextSummary(resolved.summary());
        try {
            session.setContextFactsJson(objectMapper.writeValueAsString(resolved.facts()));
        } catch (JsonProcessingException exception) {
            session.setContextFactsJson("{}");
        }
        session.setPendingClarificationJson(resolved.pendingClarification());
        session.setSummaryThroughMessageId(resolved.summaryThroughMessageIndex());
        session.setContextVersion(resolved.version());
        session.setEstimatedContextTokens(resolved.estimatedTokens());
    }

    /**
     * 聊天失败后，仍然保留本轮用户消息与错误回答，保证历史记录可回显。
     */
    @Transactional
    public AssistantConversationDetail recordFailure(AssistantConversationSessionEntity session,
                                                  AssistantChatRequest request,
                                                  AssistantConversationState latestState,
                                                  String errorMessage,
                                                  AssistantDebugInfo debugInfo,
                                                  List<PreparedAttachment> attachments) {
        if (session.isArchived()) {
            throw new IllegalArgumentException("已归档会话不能继续发送消息，请先恢复会话");
        }

        AssistantConversationMessageEntity userMessage = persistMessage(session, "user", buildDisplayedUserMessage(request), "DONE");
        if (assistantAttachmentService != null) {
            assistantAttachmentService.bindToUserMessage(userMessage, attachments);
        }
        persistMessage(session, "assistant", defaultString(errorMessage), "ERROR");
        session.setLatestPreview(resolveLatestPreview(errorMessage, request.question()));
        if (latestState != null) {
            session.setLatestDisplayStateJson(writeLatestDisplayState(buildLatestDisplayState(latestState)));
        }
        session.setLastMessageAt(LocalDateTime.now());
        AssistantConversationSessionEntity saved = assistantConversationSessionRepository.save(session);
        return buildDetail(saved);
    }

    /**
     * 兼容旧调用方：未提供附件时按空列表处理。
     */
    @Transactional
    public AssistantConversationDetail recordFailure(AssistantConversationSessionEntity session,
                                                  AssistantChatRequest request,
                                                  AssistantConversationState latestState,
                                                  String errorMessage,
                                                  AssistantDebugInfo debugInfo) {
        return recordFailure(session, request, latestState, errorMessage, debugInfo, List.of());
    }

    /**
     * 仅刷新 Assistant 最新展示态，不追加消息。
     * 业务意图：流式连接断开但工具已经写入待确认动作时，前端刷新会话仍能看到确认卡片。
     */
    @Transactional
    public AssistantConversationDetail recordLatestDisplayState(AssistantConversationSessionEntity session,
                                                             AssistantConversationState latestState,
                                                             AssistantDebugInfo debugInfo) {
        if (session.isArchived()) {
            throw new IllegalArgumentException("已归档会话不能继续更新展示态，请先恢复会话");
        }
        session.setLatestDisplayStateJson(writeLatestDisplayState(buildLatestDisplayState(latestState)));
        AssistantConversationSessionEntity saved = assistantConversationSessionRepository.save(session);
        return buildDetail(saved);
    }

    /**
     * 将会话实体转换为列表摘要。
     */
    private AssistantConversationSessionSummary toSummary(AssistantConversationSessionEntity entity) {
        return new AssistantConversationSessionSummary(
                entity.getId(),
                defaultString(entity.getTitle()),
                entity.isTitleCustomized(),
                defaultString(entity.getRouteName()),
                defaultString(entity.getRuntimeRegistryCode()).isBlank() ? "HERMES_LEGACY" : entity.getRuntimeRegistryCode(),
                entity.getRuntimeProfileVersion() == null ? 1L : entity.getRuntimeProfileVersion(),
                entity.getProjectId(),
                entity.getTaskId(),
                entity.getIterationId(),
                entity.getPlanId(),
                entity.getWikiSpaceId(),
                entity.getWikiPageId(),
                defaultString(entity.getLatestPreview()),
                entity.isArchived(),
                formatTime(entity.getCreatedAt()),
                formatTime(entity.getUpdatedAt()),
                formatTime(entity.getLastMessageAt())
        );
    }

    private AssistantConversationSearchResult toSearchResult(AssistantConversationSessionEntity session, String query) {
        List<AssistantConversationMessageEntity> matches = assistantConversationMessageRepository.findMatchingMessages(
                session.getId(), query, PageRequest.of(0, 1)
        );
        if (!matches.isEmpty()) {
            AssistantConversationMessageEntity message = matches.get(0);
            return new AssistantConversationSearchResult(
                    session.getId(),
                    defaultString(session.getTitle()),
                    session.isArchived(),
                    defaultString(message.getRole()),
                    trimToMaxLength(defaultString(message.getContent()), 220),
                    formatTime(message.getCreatedAt())
            );
        }
        return new AssistantConversationSearchResult(
                session.getId(),
                defaultString(session.getTitle()),
                session.isArchived(),
                "session",
                trimToMaxLength(defaultString(session.getLatestPreview()), 220),
                formatTime(session.getLastMessageAt())
        );
    }

    /**
     * 将会话实体与消息列表组装成详情返回体。
     */
    private AssistantConversationDetail toDetail(AssistantConversationSessionEntity entity, List<AssistantConversationMessageItem> messages) {
        return new AssistantConversationDetail(
                entity.getId(),
                defaultString(entity.getTitle()),
                entity.isTitleCustomized(),
                defaultString(entity.getRouteName()),
                defaultString(entity.getRuntimeRegistryCode()).isBlank() ? "HERMES_LEGACY" : entity.getRuntimeRegistryCode(),
                entity.getRuntimeProfileVersion() == null ? 1L : entity.getRuntimeProfileVersion(),
                entity.getProjectId(),
                entity.getTaskId(),
                entity.getIterationId(),
                entity.getPlanId(),
                entity.getWikiSpaceId(),
                entity.getWikiPageId(),
                defaultString(entity.getLatestPreview()),
                entity.isArchived(),
                formatTime(entity.getCreatedAt()),
                formatTime(entity.getUpdatedAt()),
                formatTime(entity.getLastMessageAt()),
                readLatestDisplayState(entity.getLatestDisplayStateJson()),
                messages,
                readExecutedActionKeys(entity.getExecutedActionKeysJson())
        );
    }

    /**
     * 基于已校验通过的会话实体直接组装详情，避免流式线程切换后重复读取登录态。
     */
    private AssistantConversationDetail buildDetail(AssistantConversationSessionEntity session) {
        List<AssistantConversationMessageEntity> entities = assistantConversationMessageRepository
                .findBySession_IdOrderByCreatedAtAscIdAsc(session.getId());
        List<Long> messageIds = entities.stream().map(AssistantConversationMessageEntity::getId).toList();
        var attachmentsByMessageId = assistantAttachmentService == null
                ? java.util.Map.<Long, java.util.List<com.aiclub.platform.dto.AssistantAttachmentSummary>>of()
                : assistantAttachmentService.loadMessageAttachments(messageIds);
        List<AssistantConversationMessageItem> messages = entities
                .stream()
                .map(entity -> toMessageItem(entity, attachmentsByMessageId.get(entity.getId())))
                .toList();
        return toDetail(session, messages);
    }

    /**
     * 将消息实体转换为详情中的消息项。
     */
    private AssistantConversationMessageItem toMessageItem(AssistantConversationMessageEntity entity,
                                                        List<com.aiclub.platform.dto.AssistantAttachmentSummary> attachments) {
        String role = defaultString(entity.getRole());
        String content = defaultString(entity.getContent());
        // 历史消息不回写数据库，但需要与新消息保持相同的 Markdown 展示契约。
        if ("assistant".equalsIgnoreCase(role)) {
            content = AssistantMarkdownFormatter.formatForDisplay(content);
        }
        return new AssistantConversationMessageItem(
                entity.getId(),
                role,
                content,
                normalizeMessageStatus(entity.getStatus()),
                formatTime(entity.getCreatedAt()),
                attachments
        );
    }

    /**
     * 组装最新展示态快照，只保留前端回显必需字段。
     */
    private AssistantLatestDisplayState buildLatestDisplayState(AssistantConversationState state) {
        if (state == null) {
            return AssistantLatestDisplayState.empty();
        }
        return new AssistantLatestDisplayState(
                state == null ? List.of() : state.references(),
                state == null ? List.of() : state.suggestions(),
                state == null ? List.of() : state.actions(),
                state == null ? List.of() : state.selectionCards(),
                null
        );
    }

    /**
     * 将展示态快照序列化为 JSON 文本，便于会话详情直接回显。
     */
    private String writeLatestDisplayState(AssistantLatestDisplayState latestDisplayState) {
        try {
            return objectMapper.writeValueAsString(latestDisplayState == null ? AssistantLatestDisplayState.empty() : latestDisplayState);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("GitPilot 会话展示态序列化失败", exception);
        }
    }

    /**
     * 从数据库 JSON 文本中恢复最新展示态；旧数据或脏数据统一回退为空。
     */
    private AssistantLatestDisplayState readLatestDisplayState(String latestDisplayStateJson) {
        if (!hasText(latestDisplayStateJson)) {
            return AssistantLatestDisplayState.empty();
        }
        try {
            AssistantLatestDisplayState stored = objectMapper.readValue(latestDisplayStateJson, AssistantLatestDisplayState.class);
            return new AssistantLatestDisplayState(
                    stored.references(),
                    stored.suggestions(),
                    stored.actions(),
                    stored.selectionCards(),
                    null
            );
        } catch (JsonProcessingException exception) {
            return AssistantLatestDisplayState.empty();
        }
    }

    /**
     * 从数据库 JSON 文本中恢复已执行动作 key 列表；旧数据或脏数据统一回退为空列表。
     */
    private List<String> readExecutedActionKeys(String executedActionKeysJson) {
        if (!hasText(executedActionKeysJson)) {
            return List.of();
        }
        try {
            String[] keys = objectMapper.readValue(executedActionKeysJson, String[].class);
            if (keys == null || keys.length == 0) {
                return List.of();
            }
            return List.of(keys);
        } catch (JsonProcessingException exception) {
            return List.of();
        }
    }

    /**
     * 将已执行动作 key 列表序列化为 JSON 文本，便于持久化。
     */
    private String writeExecutedActionKeys(List<String> executedActionKeys) {
        try {
            return objectMapper.writeValueAsString(executedActionKeys == null ? List.of() : executedActionKeys);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("GitPilot 已执行动作列表序列化失败", exception);
        }
    }

    /**
     * 在当前用户拥有的会话中登记一个已执行动作 key，并返回最新会话详情。
     * 同一 key 重复上报会被去重，避免列表无限增长。
     */
    @Transactional
    public AssistantConversationDetail markActionExecuted(Long sessionId, String actionKey) {
        if (!hasText(actionKey)) {
            throw new IllegalArgumentException("动作标识不能为空");
        }
        AssistantConversationSessionEntity session = requireOwnedSession(sessionId);
        List<String> existingKeys = readExecutedActionKeys(session.getExecutedActionKeysJson());
        String trimmedKey = actionKey.trim();
        if (!existingKeys.contains(trimmedKey)) {
            java.util.List<String> nextKeys = new java.util.ArrayList<>(existingKeys);
            nextKeys.add(trimmedKey);
            session.setExecutedActionKeysJson(writeExecutedActionKeys(nextKeys));
            session = assistantConversationSessionRepository.save(session);
        }
        return buildDetail(session);
    }

    /**
     * 按当前请求生成用户可读的历史消息内容，而不是保存 Assistant 内部结构化恢复文本。
     */
    private String buildDisplayedUserMessage(AssistantChatRequest request) {
        if (request == null) {
            return "";
        }
        if (request.selection() == null) {
            return defaultString(request.question());
        }
        String resumeQuestion = hasText(request.selection().resumeQuestion())
                ? request.selection().resumeQuestion().trim()
                : defaultString(request.question());
        return "已确认对象："
                + defaultString(request.selection().entityType())
                + " #"
                + request.selection().entityId()
                + "\n继续处理："
                + resumeQuestion;
    }

    /**
     * 根据本轮消息内容刷新会话列表中的最近预览。
     */
    private String resolveLatestPreview(String primaryContent, String fallbackContent) {
        if (hasText(primaryContent)) {
            return trimToMaxLength(primaryContent.trim(), MAX_PREVIEW_LENGTH);
        }
        return trimToMaxLength(defaultString(fallbackContent), MAX_PREVIEW_LENGTH);
    }

    /**
     * 按默认策略生成自动标题，只在首个成功轮次覆盖默认标题。
     */
    private String buildAutoTitle(String question) {
        return trimToMaxLength(defaultString(question), MAX_TITLE_LENGTH);
    }

    /**
     * 将一条消息持久化到数据库，供详情页直接回放。
     */
    private AssistantConversationMessageEntity persistMessage(AssistantConversationSessionEntity session, String role, String content, String status) {
        AssistantConversationMessageEntity entity = new AssistantConversationMessageEntity();
        entity.setSession(session);
        entity.setRole(defaultString(role));
        entity.setContent(defaultString(content));
        entity.setStatus(normalizePersistedMessageStatus(status));
        return assistantConversationMessageRepository.save(entity);
    }

    /**
     * 生成稳定的 Assistant 会话标识，供 Redis 热状态和内部 MCP 调用复用。
     */
    private String generateClientConversationId() {
        return "conversation-" + UUID.randomUUID().toString().replace("-", "");
    }

    /**
     * 判断当前标题是否仍是系统默认值。
     */
    private boolean isDefaultTitle(String title) {
        return DEFAULT_SESSION_TITLE.equals(defaultString(title));
    }

    /**
     * 统一将消息状态转换为前端约定的小写形式。
     */
    private String normalizeMessageStatus(String status) {
        String normalizedStatus = defaultString(status).toUpperCase();
        if ("ERROR".equals(normalizedStatus) || "FAILED".equals(normalizedStatus)) {
            return "error";
        }
        return "done";
    }

    /**
     * 将待持久化的消息状态统一转换为数据库中使用的大写编码。
     */
    private String normalizePersistedMessageStatus(String status) {
        String normalizedStatus = defaultString(status).toUpperCase();
        if ("ERROR".equals(normalizedStatus) || "FAILED".equals(normalizedStatus)) {
            return "ERROR";
        }
        return "DONE";
    }

    /**
     * 统一格式化时间输出，前端直接回显即可。
     */
    private String formatTime(LocalDateTime time) {
        return time == null ? null : time.format(TIME_FORMATTER);
    }

    /**
     * 按给定上限裁剪文本，避免会话标题和预览超长。
     */
    private String trimToMaxLength(String value, int maxLength) {
        String normalized = defaultString(value);
        if (normalized.length() <= maxLength) {
            return normalized;
        }
        return normalized.substring(0, maxLength);
    }

    /**
     * 判断字符串是否包含有效内容。
     */
    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    /**
     * 归一化会话列表作用域，未知值回退为 ALL，避免旧客户端传空或拼写错误导致接口不可用。
     */
    private String normalizeSessionScope(String scope) {
        String normalized = defaultString(scope).toUpperCase();
        if (SESSION_SCOPE_GLOBAL.equals(normalized) || SESSION_SCOPE_PROJECT.equals(normalized)) {
            return normalized;
        }
        return SESSION_SCOPE_ALL;
    }

    /**
     * 将可能为空的字符串安全归一化。
     */
    private String defaultString(String value) {
        return value == null ? "" : value.trim();
    }
}
