package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.HermesConversationMessageEntity;
import com.aiclub.platform.domain.model.HermesConversationSessionEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.CurrentUserInfo;
import com.aiclub.platform.dto.HermesConversationDetail;
import com.aiclub.platform.dto.HermesConversationMessageItem;
import com.aiclub.platform.dto.HermesConversationSessionSummary;
import com.aiclub.platform.dto.HermesDebugInfo;
import com.aiclub.platform.dto.HermesLatestDisplayState;
import com.aiclub.platform.dto.HermesConversationState;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.request.CreateHermesConversationSessionRequest;
import com.aiclub.platform.dto.request.HermesChatRequest;
import com.aiclub.platform.dto.request.RenameHermesConversationSessionRequest;
import com.aiclub.platform.repository.HermesConversationMessageRepository;
import com.aiclub.platform.repository.HermesConversationSessionRepository;
import com.aiclub.platform.repository.UserRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;

/**
 * 统一负责 Hermes 云端会话记录的增删改查与消息持久化。
 */
@Service
@Transactional(readOnly = true)
public class HermesConversationSessionService {

    /** 新建会话的默认标题。 */
    private static final String DEFAULT_SESSION_TITLE = "新会话";

    /** 会话标题最大长度。 */
    private static final int MAX_TITLE_LENGTH = 100;

    /** 会话列表预览最大长度。 */
    private static final int MAX_PREVIEW_LENGTH = 500;

    /** 会话时间统一输出格式。 */
    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final AuthService authService;
    private final UserRepository userRepository;
    private final HermesConversationSessionRepository hermesConversationSessionRepository;
    private final HermesConversationMessageRepository hermesConversationMessageRepository;
    private final ObjectMapper objectMapper;

    public HermesConversationSessionService(AuthService authService,
                                           UserRepository userRepository,
                                           HermesConversationSessionRepository hermesConversationSessionRepository,
                                           HermesConversationMessageRepository hermesConversationMessageRepository,
                                           ObjectMapper objectMapper) {
        this.authService = authService;
        this.userRepository = userRepository;
        this.hermesConversationSessionRepository = hermesConversationSessionRepository;
        this.hermesConversationMessageRepository = hermesConversationMessageRepository;
        this.objectMapper = objectMapper;
    }

    /**
     * 创建一条绑定当前页面上下文的空会话。
     * 如果当前用户已有未使用的会话（没有任何消息），则复用该会话而不是创建新的。
     */
    @Transactional
    public HermesConversationSessionSummary createSession(CreateHermesConversationSessionRequest request) {
        CurrentUserInfo currentUser = authService.currentUser();
        UserEntity userEntity = userRepository.findById(currentUser.id())
                .orElseThrow(() -> new NoSuchElementException("当前用户不存在"));

        // 检查是否有未使用的会话（没有消息的会话）
        List<HermesConversationSessionEntity> unusedSessions = hermesConversationSessionRepository
                .findByUser_IdAndArchivedAndLastMessageAtIsNull(currentUser.id(), false);

        if (!unusedSessions.isEmpty()) {
            // 如果有未使用的会话，返回第一个
            HermesConversationSessionEntity existingSession = unusedSessions.get(0);
            // 更新会话的上下文信息为当前页面
            existingSession.setRouteName(defaultString(request.routeName()));
            existingSession.setProjectId(request.projectId());
            existingSession.setTaskId(request.taskId());
            existingSession.setIterationId(request.iterationId());
            existingSession.setPlanId(request.planId());
            HermesConversationSessionEntity updated = hermesConversationSessionRepository.save(existingSession);
            return toSummary(updated);
        }

        // 如果没有未使用的会话，创建新会话
        HermesConversationSessionEntity entity = new HermesConversationSessionEntity();
        entity.setUser(userEntity);
        entity.setTitle(DEFAULT_SESSION_TITLE);
        entity.setTitleCustomized(false);
        entity.setClientConversationId(generateClientConversationId());
        entity.setRouteName(defaultString(request.routeName()));
        entity.setProjectId(request.projectId());
        entity.setTaskId(request.taskId());
        entity.setIterationId(request.iterationId());
        entity.setPlanId(request.planId());
        entity.setLatestPreview("");
        entity.setLatestDisplayStateJson(writeLatestDisplayState(HermesLatestDisplayState.empty()));
        HermesConversationSessionEntity saved = hermesConversationSessionRepository.save(entity);
        return toSummary(saved);
    }

    /**
     * 分页读取当前用户的会话列表。
     */
    public PageResponse<HermesConversationSessionSummary> pageSessions(int page, int size, boolean archived) {
        CurrentUserInfo currentUser = authService.currentUser();
        Pageable pageable = PageRequest.of(
                Math.max(page, 1) - 1,
                Math.max(1, Math.min(size, 100)),
                Sort.by(Sort.Direction.DESC, "lastMessageAt").and(Sort.by(Sort.Direction.DESC, "id"))
        );
        Page<HermesConversationSessionSummary> pageData = hermesConversationSessionRepository
                .findByUser_IdAndArchived(currentUser.id(), archived, pageable)
                .map(this::toSummary);
        return PageResponse.from(pageData);
    }

    /**
     * 读取当前用户指定会话的完整详情与历史消息。
     */
    public HermesConversationDetail getSessionDetail(Long sessionId) {
        HermesConversationSessionEntity session = requireOwnedSession(sessionId);
        return buildDetail(session);
    }

    /**
     * 重命名当前用户拥有的会话。
     */
    @Transactional
    public HermesConversationSessionSummary renameSession(Long sessionId, RenameHermesConversationSessionRequest request) {
        HermesConversationSessionEntity session = requireOwnedSession(sessionId);
        session.setTitle(trimToMaxLength(defaultString(request.title()), MAX_TITLE_LENGTH));
        session.setTitleCustomized(true);
        return toSummary(hermesConversationSessionRepository.save(session));
    }

    /**
     * 归档当前用户拥有的会话。
     */
    @Transactional
    public HermesConversationSessionSummary archiveSession(Long sessionId) {
        HermesConversationSessionEntity session = requireOwnedSession(sessionId);
        session.setArchived(true);
        session.setArchivedAt(LocalDateTime.now());
        return toSummary(hermesConversationSessionRepository.save(session));
    }

    /**
     * 恢复当前用户已归档的会话。
     */
    @Transactional
    public HermesConversationSessionSummary restoreSession(Long sessionId) {
        HermesConversationSessionEntity session = requireOwnedSession(sessionId);
        session.setArchived(false);
        session.setArchivedAt(null);
        return toSummary(hermesConversationSessionRepository.save(session));
    }

    /**
     * 删除当前用户拥有的会话及其全部消息记录。
     * 这里采用物理删除，依赖数据库外键级联清理消息表。
     */
    @Transactional
    public void deleteSession(Long sessionId) {
        HermesConversationSessionEntity session = requireOwnedSession(sessionId);
        hermesConversationSessionRepository.delete(session);
    }

    /**
     * 校验并返回当前用户拥有的会话实体。
     */
    public HermesConversationSessionEntity requireOwnedSession(Long sessionId) {
        CurrentUserInfo currentUser = authService.currentUser();
        return hermesConversationSessionRepository.findByIdAndUser_Id(sessionId, currentUser.id())
                .orElseThrow(() -> new NoSuchElementException("Hermes 会话不存在"));
    }

    /**
     * 聊天成功后，持久化本轮用户消息、助手回答和最新展示态。
     */
    @Transactional
    public HermesConversationDetail recordSuccess(HermesConversationSessionEntity session,
                                                  HermesChatRequest request,
                                                  HermesConversationState finalState,
                                                  String assistantContent,
                                                  HermesDebugInfo debugInfo) {
        if (session.isArchived()) {
            throw new IllegalArgumentException("已归档会话不能继续发送消息，请先恢复会话");
        }

        boolean shouldAutoTitle = !session.isTitleCustomized() && isDefaultTitle(session.getTitle());
        persistMessage(session, "user", buildDisplayedUserMessage(request), "DONE");
        persistMessage(session, "assistant", defaultString(assistantContent), "DONE");

        if (shouldAutoTitle && hasText(request.question())) {
            session.setTitle(buildAutoTitle(request.question()));
        }

        session.setLatestPreview(resolveLatestPreview(assistantContent, request.question()));
        session.setLatestDisplayStateJson(writeLatestDisplayState(buildLatestDisplayState(finalState, debugInfo)));
        session.setLastMessageAt(LocalDateTime.now());
        HermesConversationSessionEntity saved = hermesConversationSessionRepository.save(session);
        return buildDetail(saved);
    }

    /**
     * 聊天失败后，仍然保留本轮用户消息与错误回答，保证历史记录可回显。
     */
    @Transactional
    public HermesConversationDetail recordFailure(HermesConversationSessionEntity session,
                                                  HermesChatRequest request,
                                                  HermesConversationState latestState,
                                                  String errorMessage,
                                                  HermesDebugInfo debugInfo) {
        if (session.isArchived()) {
            throw new IllegalArgumentException("已归档会话不能继续发送消息，请先恢复会话");
        }

        persistMessage(session, "user", buildDisplayedUserMessage(request), "DONE");
        persistMessage(session, "assistant", defaultString(errorMessage), "ERROR");
        session.setLatestPreview(resolveLatestPreview(errorMessage, request.question()));
        if (latestState != null || debugInfo != null) {
            session.setLatestDisplayStateJson(writeLatestDisplayState(buildLatestDisplayState(latestState, debugInfo)));
        }
        session.setLastMessageAt(LocalDateTime.now());
        HermesConversationSessionEntity saved = hermesConversationSessionRepository.save(session);
        return buildDetail(saved);
    }

    /**
     * 将会话实体转换为列表摘要。
     */
    private HermesConversationSessionSummary toSummary(HermesConversationSessionEntity entity) {
        return new HermesConversationSessionSummary(
                entity.getId(),
                defaultString(entity.getTitle()),
                entity.isTitleCustomized(),
                defaultString(entity.getRouteName()),
                entity.getProjectId(),
                entity.getTaskId(),
                entity.getIterationId(),
                entity.getPlanId(),
                defaultString(entity.getLatestPreview()),
                entity.isArchived(),
                formatTime(entity.getCreatedAt()),
                formatTime(entity.getUpdatedAt()),
                formatTime(entity.getLastMessageAt())
        );
    }

    /**
     * 将会话实体与消息列表组装成详情返回体。
     */
    private HermesConversationDetail toDetail(HermesConversationSessionEntity entity, List<HermesConversationMessageItem> messages) {
        return new HermesConversationDetail(
                entity.getId(),
                defaultString(entity.getTitle()),
                entity.isTitleCustomized(),
                defaultString(entity.getRouteName()),
                entity.getProjectId(),
                entity.getTaskId(),
                entity.getIterationId(),
                entity.getPlanId(),
                defaultString(entity.getLatestPreview()),
                entity.isArchived(),
                formatTime(entity.getCreatedAt()),
                formatTime(entity.getUpdatedAt()),
                formatTime(entity.getLastMessageAt()),
                readLatestDisplayState(entity.getLatestDisplayStateJson()),
                messages
        );
    }

    /**
     * 基于已校验通过的会话实体直接组装详情，避免流式线程切换后重复读取登录态。
     */
    private HermesConversationDetail buildDetail(HermesConversationSessionEntity session) {
        List<HermesConversationMessageItem> messages = hermesConversationMessageRepository
                .findBySession_IdOrderByCreatedAtAscIdAsc(session.getId())
                .stream()
                .map(this::toMessageItem)
                .toList();
        return toDetail(session, messages);
    }

    /**
     * 将消息实体转换为详情中的消息项。
     */
    private HermesConversationMessageItem toMessageItem(HermesConversationMessageEntity entity) {
        return new HermesConversationMessageItem(
                entity.getId(),
                defaultString(entity.getRole()),
                defaultString(entity.getContent()),
                normalizeMessageStatus(entity.getStatus()),
                formatTime(entity.getCreatedAt())
        );
    }

    /**
     * 组装最新展示态快照，只保留前端回显必需字段。
     */
    private HermesLatestDisplayState buildLatestDisplayState(HermesConversationState state, HermesDebugInfo debugInfo) {
        if (state == null && debugInfo == null) {
            return HermesLatestDisplayState.empty();
        }
        return new HermesLatestDisplayState(
                state == null ? List.of() : state.references(),
                state == null ? List.of() : state.suggestions(),
                state == null ? List.of() : state.actions(),
                state == null ? List.of() : state.selectionCards(),
                debugInfo
        );
    }

    /**
     * 将展示态快照序列化为 JSON 文本，便于会话详情直接回显。
     */
    private String writeLatestDisplayState(HermesLatestDisplayState latestDisplayState) {
        try {
            return objectMapper.writeValueAsString(latestDisplayState == null ? HermesLatestDisplayState.empty() : latestDisplayState);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Hermes 会话展示态序列化失败", exception);
        }
    }

    /**
     * 从数据库 JSON 文本中恢复最新展示态；旧数据或脏数据统一回退为空。
     */
    private HermesLatestDisplayState readLatestDisplayState(String latestDisplayStateJson) {
        if (!hasText(latestDisplayStateJson)) {
            return HermesLatestDisplayState.empty();
        }
        try {
            return objectMapper.readValue(latestDisplayStateJson, HermesLatestDisplayState.class);
        } catch (JsonProcessingException exception) {
            return HermesLatestDisplayState.empty();
        }
    }

    /**
     * 按当前请求生成用户可读的历史消息内容，而不是保存 Hermes 内部结构化恢复文本。
     */
    private String buildDisplayedUserMessage(HermesChatRequest request) {
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
    private void persistMessage(HermesConversationSessionEntity session, String role, String content, String status) {
        HermesConversationMessageEntity entity = new HermesConversationMessageEntity();
        entity.setSession(session);
        entity.setRole(defaultString(role));
        entity.setContent(defaultString(content));
        entity.setStatus(normalizePersistedMessageStatus(status));
        hermesConversationMessageRepository.save(entity);
    }

    /**
     * 生成稳定的 Hermes 会话标识，供 Redis 热状态和内部 MCP 调用复用。
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
     * 将可能为空的字符串安全归一化。
     */
    private String defaultString(String value) {
        return value == null ? "" : value.trim();
    }
}
