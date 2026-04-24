package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.NotificationMessageEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.NotificationItem;
import com.aiclub.platform.dto.NotificationRealtimeEvent;
import com.aiclub.platform.dto.NotificationUnreadSummary;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.request.SystemAnnouncementRequest;
import com.aiclub.platform.exception.UnauthorizedException;
import com.aiclub.platform.repository.NotificationMessageRepository;
import com.aiclub.platform.repository.UserRepository;
import com.aiclub.platform.security.AuthContext;
import com.aiclub.platform.security.AuthContextHolder;
import jakarta.persistence.criteria.Predicate;
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
import java.util.LinkedHashSet;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.Set;

@Service
@Transactional(readOnly = true)
public class NotificationService {

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    public static final String TYPE_TASK = "TASK";
    public static final String TYPE_GITLAB = "GITLAB";
    public static final String TYPE_CICD = "CICD";
    public static final String TYPE_SYSTEM = "SYSTEM";

    public static final String LEVEL_INFO = "INFO";
    public static final String LEVEL_SUCCESS = "SUCCESS";
    public static final String LEVEL_WARNING = "WARNING";
    public static final String LEVEL_ERROR = "ERROR";

    private static final int TYPE_MAX_LENGTH = 30;
    private static final int LEVEL_MAX_LENGTH = 20;
    private static final int SENDER_NAME_MAX_LENGTH = 100;
    private static final int TITLE_MAX_LENGTH = 200;
    private static final int CONTENT_MAX_LENGTH = 5000;
    private static final int BIZ_TYPE_MAX_LENGTH = 80;
    private static final int ACTION_URL_MAX_LENGTH = 300;

    private final NotificationMessageRepository notificationMessageRepository;
    private final UserRepository userRepository;
    private final NotificationPushService notificationPushService;

    public NotificationService(NotificationMessageRepository notificationMessageRepository,
                               UserRepository userRepository,
                               NotificationPushService notificationPushService) {
        this.notificationMessageRepository = notificationMessageRepository;
        this.userRepository = userRepository;
        this.notificationPushService = notificationPushService;
    }

    public PageResponse<NotificationItem> pageCurrentUserNotifications(int page, int size, Boolean unreadOnly, String type) {
        Long userId = requireCurrentUserId();
        Pageable pageable = PageRequest.of(Math.max(page, 1) - 1, Math.max(1, Math.min(size, 50)), Sort.by(Sort.Direction.DESC, "createdAt", "id"));
        Page<NotificationItem> pageData = notificationMessageRepository.findAll(notificationSpecification(userId, unreadOnly, type), pageable)
                .map(this::toNotificationItem);
        return PageResponse.from(pageData);
    }

    public NotificationUnreadSummary currentUserUnreadSummary() {
        return new NotificationUnreadSummary(notificationMessageRepository.countByRecipientUser_IdAndReadFlagFalse(requireCurrentUserId()));
    }

    @Transactional
    public NotificationItem markCurrentUserRead(Long id) {
        NotificationMessageEntity entity = notificationMessageRepository.findByIdAndRecipientUser_Id(id, requireCurrentUserId())
                .orElseThrow(() -> new NoSuchElementException("消息不存在: " + id));
        if (!entity.isReadFlag()) {
            entity.setReadFlag(true);
            entity.setReadAt(LocalDateTime.now());
            entity = notificationMessageRepository.save(entity);
        }
        return toNotificationItem(entity);
    }

    @Transactional
    public NotificationUnreadSummary markCurrentUserReadAll() {
        Long userId = requireCurrentUserId();
        List<NotificationMessageEntity> messages = notificationMessageRepository.findAll(notificationSpecification(userId, true, null));
        LocalDateTime now = LocalDateTime.now();
        for (NotificationMessageEntity entity : messages) {
            entity.setReadFlag(true);
            entity.setReadAt(now);
        }
        notificationMessageRepository.saveAll(messages);
        return new NotificationUnreadSummary(0);
    }

    @Transactional
    public void publishSystemAnnouncement(SystemAnnouncementRequest request) {
        List<UserEntity> recipients = request.recipientUserIds() == null || request.recipientUserIds().isEmpty()
                ? userRepository.findAllByEnabledTrueOrderByIdAsc()
                : userRepository.findAllById(request.recipientUserIds()).stream().filter(UserEntity::isEnabled).toList();
        Set<Long> recipientIds = recipients.stream().map(UserEntity::getId).collect(LinkedHashSet::new, LinkedHashSet::add, LinkedHashSet::addAll);
        sendToUsers(
                recipientIds,
                TYPE_SYSTEM,
                normalizeLevel(request.level()),
                request.title().trim(),
                request.content().trim(),
                trimToNull(request.actionUrl()),
                "SYSTEM_ANNOUNCEMENT",
                null
        );
    }

    @Transactional
    public void sendToUser(Long userId, String type, String level, String title, String content, String actionUrl, String bizType, Long bizId) {
        if (userId == null) {
            return;
        }
        userRepository.findById(userId).filter(UserEntity::isEnabled).ifPresent(user ->
                createAndPush(user, type, level, title, content, actionUrl, bizType, bizId, currentActorName(), currentActorUser())
        );
    }

    @Transactional
    public void sendToUsers(Set<Long> userIds, String type, String level, String title, String content, String actionUrl, String bizType, Long bizId) {
        if (userIds == null || userIds.isEmpty()) {
            return;
        }
        Set<Long> distinctIds = new LinkedHashSet<>(userIds);
        UserEntity sender = currentActorUser();
        String senderName = currentActorName();
        for (UserEntity user : userRepository.findAllById(distinctIds)) {
            if (!user.isEnabled()) {
                continue;
            }
            createAndPush(user, type, level, title, content, actionUrl, bizType, bizId, senderName, sender);
        }
    }

    @Transactional
    public void sendToGitlabUser(String gitlabUsername, String type, String level, String title, String content, String actionUrl, String bizType, Long bizId) {
        String normalized = trimToNull(gitlabUsername);
        if (normalized == null) {
            return;
        }
        userRepository.findByGitlabUsernameIgnoreCase(normalized)
                .filter(UserEntity::isEnabled)
                .ifPresent(user -> createAndPush(user, type, level, title, content, actionUrl, bizType, bizId, currentActorName(), currentActorUser()));
    }

    private void createAndPush(UserEntity recipient, String type, String level, String title, String content,
                               String actionUrl, String bizType, Long bizId, String senderName, UserEntity senderUser) {
        NotificationMessageEntity entity = new NotificationMessageEntity();
        entity.setRecipientUser(recipient);
        entity.setSenderUser(senderUser);
        // 通知调用点很多，统一在服务入口按数据库列长度收口，避免单个长业务类型拖垮执行任务收尾事务。
        entity.setSenderName(limit(senderName, SENDER_NAME_MAX_LENGTH));
        entity.setType(limit(normalizeType(type), TYPE_MAX_LENGTH));
        entity.setLevel(limit(normalizeLevel(level), LEVEL_MAX_LENGTH));
        entity.setTitle(limit(title, TITLE_MAX_LENGTH));
        entity.setContent(limit(content, CONTENT_MAX_LENGTH));
        entity.setActionUrl(limitToNull(actionUrl, ACTION_URL_MAX_LENGTH));
        entity.setBizType(limitToNull(bizType, BIZ_TYPE_MAX_LENGTH));
        entity.setBizId(bizId);
        NotificationMessageEntity saved = notificationMessageRepository.save(entity);
        long unreadCount = notificationMessageRepository.countByRecipientUser_IdAndReadFlagFalse(recipient.getId());
        notificationPushService.pushToUser(recipient.getId(), new NotificationRealtimeEvent("NEW_NOTIFICATION", toNotificationItem(saved), unreadCount));
    }

    private Specification<NotificationMessageEntity> notificationSpecification(Long userId, Boolean unreadOnly, String type) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.equal(root.get("recipientUser").get("id"), userId));
            if (Boolean.TRUE.equals(unreadOnly)) {
                predicates.add(cb.isFalse(root.get("readFlag")));
            }
            if (trimToNull(type) != null) {
                predicates.add(cb.equal(root.get("type"), normalizeType(type)));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    private NotificationItem toNotificationItem(NotificationMessageEntity entity) {
        return new NotificationItem(
                entity.getId(),
                entity.getType(),
                entity.getLevel(),
                entity.getTitle(),
                entity.getContent(),
                entity.getBizType(),
                entity.getBizId(),
                entity.getActionUrl(),
                entity.isReadFlag(),
                entity.getSenderName(),
                formatTime(entity.getCreatedAt()),
                formatTime(entity.getReadAt())
        );
    }

    private Long requireCurrentUserId() {
        return AuthContextHolder.get().map(AuthContext::userId).orElseThrow(() -> new UnauthorizedException("Not logged in"));
    }

    private UserEntity currentActorUser() {
        return AuthContextHolder.get()
                .flatMap(context -> userRepository.findById(context.userId()))
                .orElse(null);
    }

    private String currentActorName() {
        return AuthContextHolder.get()
                .map(context -> hasText(context.nickname()) ? context.nickname().trim() : context.username().trim())
                .orElse("系统");
    }

    private String normalizeType(String type) {
        String normalized = trimToNull(type);
        if (normalized == null) {
            return TYPE_SYSTEM;
        }
        return normalized.toUpperCase();
    }

    private String normalizeLevel(String level) {
        String normalized = trimToNull(level);
        if (normalized == null) {
            return LEVEL_INFO;
        }
        return normalized.toUpperCase();
    }

    private String formatTime(LocalDateTime time) {
        return time == null ? null : time.format(TIME_FORMATTER);
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private String defaultString(String value) {
        return value == null ? "" : value.trim();
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private String limit(String value, int maxLength) {
        String normalized = defaultString(value);
        return normalized.length() > maxLength ? normalized.substring(0, maxLength) : normalized;
    }

    private String limitToNull(String value, int maxLength) {
        String normalized = trimToNull(value);
        if (normalized == null) {
            return null;
        }
        return normalized.length() > maxLength ? normalized.substring(0, maxLength) : normalized;
    }
}
