package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.AssistantConversationMessageEntity;
import com.aiclub.platform.domain.model.AssistantConversationSessionEntity;
import com.aiclub.platform.domain.model.AssistantFeedbackActivityEntity;
import com.aiclub.platform.domain.model.AssistantMessageFeedbackEntity;
import com.aiclub.platform.dto.AssistantFeedbackActivitySummary;
import com.aiclub.platform.dto.AssistantFeedbackDetail;
import com.aiclub.platform.dto.AssistantFeedbackStats;
import com.aiclub.platform.dto.AssistantFeedbackSummary;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.request.AssistantFeedbackQueryRequest;
import com.aiclub.platform.dto.request.AssistantFeedbackResolutionRequest;
import com.aiclub.platform.dto.request.AssistantFeedbackTriageRequest;
import com.aiclub.platform.dto.request.AssistantMessageFeedbackRequest;
import com.aiclub.platform.repository.AssistantConversationMessageRepository;
import com.aiclub.platform.repository.AssistantConversationSessionRepository;
import com.aiclub.platform.repository.AssistantFeedbackActivityRepository;
import com.aiclub.platform.repository.AssistantMessageFeedbackRepository;
import com.aiclub.platform.repository.UserRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.NoSuchElementException;
import java.util.Set;

/**
 * GitPilot 用户反馈闭环服务。
 * 业务意图：将用户即时评价、运营状态、处理结论和复盘数据集标记收口在同一条可追踪链路中。
 */
@Service
@Transactional(readOnly = true)
public class AssistantFeedbackService {

    private static final Set<String> VOTES = Set.of("UP", "DOWN");
    private static final Set<String> REASONS = Set.of("WRONG_ANSWER", "IRRELEVANT", "MISSING_CONTEXT", "TOOL_FAILED", "INTERRUPTED", "UNCLEAR", "OTHER");
    private static final Set<String> TRIAGE_STATUSES = Set.of("NEW", "TRIAGED", "IN_PROGRESS");
    private static final Set<String> FINAL_STATUSES = Set.of("RESOLVED", "REJECTED", "DUPLICATE");
    private static final Set<String> DATASET_STATUSES = Set.of("PENDING", "INCLUDED", "EXCLUDED");
    private static final Set<String> RESOLUTION_CODES = Set.of("PROMPT_FIX", "MODEL_ISSUE", "KNOWLEDGE_GAP", "TOOL_BUG", "USER_MISUNDERSTANDING", "NO_ACTION", "DUPLICATE");
    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final AssistantMessageFeedbackRepository feedbackRepository;
    private final AssistantFeedbackActivityRepository activityRepository;
    private final AssistantConversationMessageRepository messageRepository;
    private final AssistantConversationSessionRepository sessionRepository;
    private final UserRepository userRepository;
    private final AssistantConversationSessionService sessionService;
    private final AuthService authService;
    private final ObjectMapper objectMapper;

    public AssistantFeedbackService(AssistantMessageFeedbackRepository feedbackRepository,
                                    AssistantFeedbackActivityRepository activityRepository,
                                    AssistantConversationMessageRepository messageRepository,
                                    AssistantConversationSessionRepository sessionRepository,
                                    UserRepository userRepository,
                                    AssistantConversationSessionService sessionService,
                                    AuthService authService,
                                    ObjectMapper objectMapper) {
        this.feedbackRepository = feedbackRepository;
        this.activityRepository = activityRepository;
        this.messageRepository = messageRepository;
        this.sessionRepository = sessionRepository;
        this.userRepository = userRepository;
        this.sessionService = sessionService;
        this.authService = authService;
        this.objectMapper = objectMapper;
    }

    /** 保存或覆盖当前用户对指定助手回答的评价。 */
    @Transactional
    public AssistantFeedbackSummary submit(Long sessionId, Long assistantMessageId, AssistantMessageFeedbackRequest request) {
        var currentUser = authService.currentUser();
        AssistantConversationSessionEntity session = sessionService.requireOwnedSession(sessionId);
        AssistantConversationMessageEntity assistantMessage = messageRepository
                .findByIdAndSession_IdAndRole(assistantMessageId, sessionId, "assistant")
                .orElseThrow(() -> new NoSuchElementException("GitPilot 助手回答不存在"));
        validateRequest(request);

        List<AssistantConversationMessageEntity> messages = messageRepository.findBySession_IdOrderByCreatedAtAscIdAsc(sessionId);
        String questionSnapshot = findPreviousUserMessage(messages, assistantMessage.getId());
        AssistantMessageFeedbackEntity entity = feedbackRepository
                .findBySubmitterUserIdAndAssistantMessageId(currentUser.id(), assistantMessageId)
                .orElseGet(AssistantMessageFeedbackEntity::new);
        boolean created = entity.getId() == null;
        String previousStatus = entity.getStatus();
        entity.setSessionId(sessionId);
        entity.setUserMessageId(findPreviousUserMessageId(messages, assistantMessage.getId()));
        entity.setAssistantMessageId(assistantMessageId);
        entity.setSubmitterUserId(currentUser.id());
        entity.setSubmitterUsername(defaultString(currentUser.username()));
        entity.setSubmitterNickname(resolveNickname(currentUser.nickname(), currentUser.username()));
        entity.setVote(normalizeVote(request.vote()));
        entity.setReasonCodesJson(writeJson(normalizeReasons(request.reasonCodes())));
        entity.setComment(trimToMaxLength(defaultString(request.comment()), 2000));
        entity.setQuestionSnapshot(questionSnapshot);
        entity.setAnswerSnapshot(defaultString(assistantMessage.getContent()));
        entity.setRuntimeRegistryCode(defaultString(session.getRuntimeRegistryCode()));
        entity.setRouteName(defaultString(session.getRouteName()));
        entity.setProjectId(session.getProjectId());
        entity.setStatus("UP".equals(entity.getVote()) ? "AUTO_CLOSED" : "NEW");
        entity.setDatasetStatus("PENDING");
        entity.setResolutionCode(null);
        entity.setResolutionNote("");
        entity.setImprovementTagsJson("[]");
        entity.setResolvedAt("UP".equals(entity.getVote()) ? LocalDateTime.now() : null);
        AssistantMessageFeedbackEntity saved = feedbackRepository.save(entity);
        recordActivity(saved.getId(), created ? "CREATED" : "UPDATED", created ? null : previousStatus,
                saved.getStatus(), created ? "用户提交 GitPilot 回答评价" : "用户更新 GitPilot 回答评价", currentUser.id());
        return toSummary(saved);
    }

    /** 分页读取当前用户反馈，支持按会话回显反馈状态。 */
    public PageResponse<AssistantFeedbackSummary> pageMine(int page, int size, Long sessionId) {
        Long userId = authService.currentUser().id();
        Pageable pageable = pageable(page, size);
        Page<AssistantMessageFeedbackEntity> result = sessionId == null
                ? feedbackRepository.findAllBySubmitterUserId(userId, pageable)
                : feedbackRepository.findAllBySubmitterUserIdAndSessionId(userId, sessionId, pageable);
        return PageResponse.from(result.map(this::toSummary));
    }

    /** 读取当前用户拥有的一条反馈详情。 */
    public AssistantFeedbackDetail getMine(Long id) {
        Long userId = authService.currentUser().id();
        AssistantMessageFeedbackEntity entity = feedbackRepository.findById(id)
                .filter(item -> userId.equals(item.getSubmitterUserId()))
                .orElseThrow(() -> new NoSuchElementException("GitPilot 反馈不存在"));
        return toDetail(entity);
    }

    /** 分页读取管理员反馈运营队列。 */
    public PageResponse<AssistantFeedbackSummary> pageAdmin(int page, int size, AssistantFeedbackQueryRequest query) {
        Pageable pageable = pageable(page, size);
        Page<AssistantMessageFeedbackEntity> result = feedbackRepository.findAll(buildSpecification(query), pageable);
        return PageResponse.from(result.map(this::toSummary));
    }

    /** 读取管理员反馈详情和处理活动。 */
    public AssistantFeedbackDetail getAdmin(Long id) {
        return toDetail(feedbackRepository.findById(id).orElseThrow(() -> new NoSuchElementException("GitPilot 反馈不存在")));
    }

    /** 反馈队列概览，供管理端统计卡片使用。 */
    public AssistantFeedbackStats stats() {
        return new AssistantFeedbackStats(
                feedbackRepository.countByStatus("NEW"),
                feedbackRepository.countByStatus("IN_PROGRESS"),
                feedbackRepository.countByStatus("RESOLVED"),
                feedbackRepository.countByVote("DOWN"),
                feedbackRepository.count()
        );
    }

    /** 更新分诊状态和负责人。 */
    @Transactional
    public AssistantFeedbackDetail triage(Long id, AssistantFeedbackTriageRequest request) {
        validateTriage(request);
        AssistantMessageFeedbackEntity entity = requireFeedback(id);
        String previousStatus = entity.getStatus();
        entity.setStatus(normalizeUpper(request.status()));
        entity.setAssigneeUserId(validateAssignee(request.assigneeUserId()));
        AssistantMessageFeedbackEntity saved = feedbackRepository.save(entity);
        recordActivity(id, "TRIAGED", previousStatus, saved.getStatus(), defaultString(request.note()), authService.currentUser().id());
        return toDetail(saved);
    }

    /** 更新处理结论和复盘数据集状态。 */
    @Transactional
    public AssistantFeedbackDetail resolve(Long id, AssistantFeedbackResolutionRequest request) {
        validateResolution(request);
        AssistantMessageFeedbackEntity entity = requireFeedback(id);
        String previousStatus = entity.getStatus();
        entity.setStatus(normalizeUpper(request.status()));
        entity.setResolutionCode(normalizeUpper(request.resolutionCode()));
        entity.setResolutionNote(trimToMaxLength(defaultString(request.resolutionNote()), 4000));
        entity.setImprovementTagsJson(writeJson(normalizeTags(request.improvementTags())));
        entity.setDatasetStatus(normalizeUpper(request.datasetStatus()));
        entity.setResolvedAt(LocalDateTime.now());
        AssistantMessageFeedbackEntity saved = feedbackRepository.save(entity);
        recordActivity(id, "RESOLVED", previousStatus, saved.getStatus(), saved.getResolutionNote(), authService.currentUser().id());
        return toDetail(saved);
    }

    /** 分页读取已纳入复盘数据集的反馈样本。 */
    public PageResponse<AssistantFeedbackSummary> pageDataset(int page, int size, String keyword) {
        AssistantFeedbackQueryRequest query = new AssistantFeedbackQueryRequest(keyword, null, null, "INCLUDED", null, null);
        return pageAdmin(page, size, query);
    }

    private Specification<AssistantMessageFeedbackEntity> buildSpecification(AssistantFeedbackQueryRequest query) {
        AssistantFeedbackQueryRequest safe = query == null ? new AssistantFeedbackQueryRequest(null, null, null, null, null, null) : query;
        return (root, criteriaQuery, cb) -> {
            List<jakarta.persistence.criteria.Predicate> predicates = new ArrayList<>();
            if (hasText(safe.keyword())) {
                String keyword = "%" + safe.keyword().trim().toLowerCase(Locale.ROOT) + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("questionSnapshot")), keyword),
                        cb.like(cb.lower(root.get("answerSnapshot")), keyword),
                        cb.like(cb.lower(root.get("comment")), keyword),
                        cb.like(cb.lower(root.get("submitterNickname")), keyword)
                ));
            }
            if (hasText(safe.vote())) predicates.add(cb.equal(root.get("vote"), normalizeUpper(safe.vote())));
            if (hasText(safe.status())) predicates.add(cb.equal(root.get("status"), normalizeUpper(safe.status())));
            if (hasText(safe.datasetStatus())) predicates.add(cb.equal(root.get("datasetStatus"), normalizeUpper(safe.datasetStatus())));
            if (safe.projectId() != null) predicates.add(cb.equal(root.get("projectId"), safe.projectId()));
            if (safe.assigneeUserId() != null) predicates.add(cb.equal(root.get("assigneeUserId"), safe.assigneeUserId()));
            return cb.and(predicates.toArray(jakarta.persistence.criteria.Predicate[]::new));
        };
    }

    private AssistantMessageFeedbackEntity requireFeedback(Long id) {
        return feedbackRepository.findById(id).orElseThrow(() -> new NoSuchElementException("GitPilot 反馈不存在"));
    }

    private void validateRequest(AssistantMessageFeedbackRequest request) {
        if (request == null || !VOTES.contains(normalizeUpper(request.vote()))) throw new IllegalArgumentException("反馈方向不合法");
        List<String> reasons = normalizeReasons(request.reasonCodes());
        if ("DOWN".equals(normalizeUpper(request.vote())) && reasons.isEmpty()) throw new IllegalArgumentException("点踩反馈至少选择一个原因");
    }

    private void validateTriage(AssistantFeedbackTriageRequest request) {
        if (request == null || !TRIAGE_STATUSES.contains(normalizeUpper(request.status()))) throw new IllegalArgumentException("分诊状态不合法");
    }

    private void validateResolution(AssistantFeedbackResolutionRequest request) {
        if (request == null || !FINAL_STATUSES.contains(normalizeUpper(request.status()))) throw new IllegalArgumentException("处理结论状态不合法");
        if (!RESOLUTION_CODES.contains(normalizeUpper(request.resolutionCode()))) throw new IllegalArgumentException("处理结论类型不合法");
        if (!DATASET_STATUSES.contains(normalizeUpper(request.datasetStatus()))) throw new IllegalArgumentException("数据集状态不合法");
        if ("INCLUDED".equals(normalizeUpper(request.datasetStatus())) && request.status() == null) throw new IllegalArgumentException("数据集标记前必须完成反馈处理");
    }

    private Long validateAssignee(Long userId) {
        if (userId == null) return null;
        if (userRepository.findById(userId).isEmpty()) throw new NoSuchElementException("负责人用户不存在");
        return userId;
    }

    private void recordActivity(Long feedbackId, String actionType, String fromStatus, String toStatus, String note, Long actorUserId) {
        AssistantFeedbackActivityEntity activity = new AssistantFeedbackActivityEntity();
        activity.setFeedbackId(feedbackId);
        activity.setActionType(actionType);
        activity.setFromStatus(fromStatus);
        activity.setToStatus(toStatus);
        activity.setNote(defaultString(note));
        activity.setActorUserId(actorUserId);
        activityRepository.save(activity);
    }

    private AssistantFeedbackDetail toDetail(AssistantMessageFeedbackEntity entity) {
        List<AssistantFeedbackActivitySummary> activities = activityRepository.findAllByFeedbackIdOrderByCreatedAtDescIdDesc(entity.getId())
                .stream().map(item -> new AssistantFeedbackActivitySummary(item.getId(), item.getActionType(), item.getFromStatus(), item.getToStatus(), item.getNote(), item.getActorUserId(), formatTime(item.getCreatedAt()))).toList();
        return new AssistantFeedbackDetail(toSummary(entity), activities);
    }

    private AssistantFeedbackSummary toSummary(AssistantMessageFeedbackEntity entity) {
        return new AssistantFeedbackSummary(entity.getId(), entity.getSessionId(), entity.getAssistantMessageId(), entity.getUserMessageId(), entity.getSubmitterUserId(),
                entity.getSubmitterUsername(), entity.getSubmitterNickname(), entity.getVote(), readJson(entity.getReasonCodesJson()), entity.getComment(), entity.getQuestionSnapshot(), entity.getAnswerSnapshot(),
                entity.getRuntimeRegistryCode(), entity.getRouteName(), entity.getProjectId(), entity.getStatus(), entity.getAssigneeUserId(), entity.getResolutionCode(), entity.getResolutionNote(),
                readJson(entity.getImprovementTagsJson()), entity.getDatasetStatus(), formatTime(entity.getCreatedAt()), formatTime(entity.getUpdatedAt()), formatTime(entity.getResolvedAt()));
    }

    private String findPreviousUserMessage(List<AssistantConversationMessageEntity> messages, Long assistantMessageId) {
        int index = findMessageIndex(messages, assistantMessageId);
        if (index <= 0) return "";
        AssistantConversationMessageEntity previous = messages.get(index - 1);
        return "user".equalsIgnoreCase(previous.getRole()) ? defaultString(previous.getContent()) : "";
    }

    private Long findPreviousUserMessageId(List<AssistantConversationMessageEntity> messages, Long assistantMessageId) {
        int index = findMessageIndex(messages, assistantMessageId);
        if (index <= 0) return null;
        AssistantConversationMessageEntity previous = messages.get(index - 1);
        return "user".equalsIgnoreCase(previous.getRole()) ? previous.getId() : null;
    }

    private int findMessageIndex(List<AssistantConversationMessageEntity> messages, Long messageId) {
        for (int i = 0; i < messages.size(); i++) if (messageId.equals(messages.get(i).getId())) return i;
        return -1;
    }

    private List<String> normalizeReasons(List<String> values) {
        if (values == null) return List.of();
        return values.stream().filter(value -> value != null && REASONS.contains(normalizeUpper(value))).map(this::normalizeUpper).distinct().toList();
    }

    private List<String> normalizeTags(List<String> values) {
        if (values == null) return List.of();
        return values.stream().filter(this::hasText).map(value -> trimToMaxLength(value.trim(), 50)).distinct().limit(12).toList();
    }

    private List<String> readJson(String value) {
        try { return objectMapper.readValue(defaultString(value), new TypeReference<>() {}); }
        catch (Exception exception) { return List.of(); }
    }

    private String writeJson(Object value) {
        try { return objectMapper.writeValueAsString(value); }
        catch (JsonProcessingException exception) { throw new IllegalStateException("GitPilot 反馈数据序列化失败", exception); }
    }

    private Pageable pageable(int page, int size) {
        return PageRequest.of(Math.max(page - 1, 0), Math.max(1, Math.min(size, 100)), Sort.by(Sort.Direction.DESC, "createdAt").and(Sort.by(Sort.Direction.DESC, "id")));
    }

    private String normalizeVote(String value) { return normalizeUpper(value); }
    private String normalizeUpper(String value) { return defaultString(value).toUpperCase(Locale.ROOT); }
    private String defaultString(String value) { return value == null ? "" : value.trim(); }
    private boolean hasText(String value) { return value != null && !value.trim().isEmpty(); }
    private String resolveNickname(String nickname, String username) { return hasText(nickname) ? nickname.trim() : defaultString(username); }
    private String trimToMaxLength(String value, int maxLength) { return value.length() <= maxLength ? value : value.substring(0, maxLength); }
    private String formatTime(LocalDateTime value) { return value == null ? null : value.format(TIME_FORMATTER); }
}
