package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ChatMessageAttachmentEntity;
import com.aiclub.platform.domain.model.ChatMessageEntity;
import com.aiclub.platform.domain.model.ChatRoomEntity;
import com.aiclub.platform.domain.model.ChatRoomMemberEntity;
import com.aiclub.platform.domain.model.DocumentAssetEntity;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.ChatAttachmentSummary;
import com.aiclub.platform.dto.ChatMemberSummary;
import com.aiclub.platform.dto.ChatMessageSummary;
import com.aiclub.platform.dto.ChatRoomDetail;
import com.aiclub.platform.dto.ChatRoomSummary;
import com.aiclub.platform.dto.CurrentUserInfo;
import com.aiclub.platform.dto.request.CreateChatRoomRequest;
import com.aiclub.platform.dto.request.SendChatMessageRequest;
import com.aiclub.platform.dto.request.UpdateChatRoomMembersRequest;
import com.aiclub.platform.exception.ForbiddenException;
import com.aiclub.platform.repository.ChatMessageAttachmentRepository;
import com.aiclub.platform.repository.ChatMessageRepository;
import com.aiclub.platform.repository.ChatRoomMemberRepository;
import com.aiclub.platform.repository.ChatRoomRepository;
import com.aiclub.platform.repository.ProjectRepository;
import com.aiclub.platform.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Set;
import java.util.concurrent.Executor;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * 聊天室核心服务。
 * 业务意图：统一处理房间权限、成员邀请、消息落库和 @Hermes 触发，避免 REST 与 WebSocket 各自复制规则。
 */
@Service
@Transactional(readOnly = true)
public class ChatRoomService {

    public static final String VISIBILITY_PROJECT = "PROJECT";
    public static final String VISIBILITY_GLOBAL_INVITE = "GLOBAL_INVITE";
    public static final String ROLE_USER = "user";
    public static final String ROLE_ASSISTANT = "assistant";
    public static final String STATUS_DONE = "DONE";
    public static final String STATUS_STREAMING = "STREAMING";
    public static final String STATUS_ERROR = "ERROR";

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final Pattern HERMES_MENTION_PATTERN = Pattern.compile("(^|\\s)@hermes\\b", Pattern.CASE_INSENSITIVE);
    private static final int MAX_PREVIEW_LENGTH = 500;

    private final AuthService authService;
    private final UserRepository userRepository;
    private final ProjectRepository projectRepository;
    private final ChatRoomRepository chatRoomRepository;
    private final ChatRoomMemberRepository chatRoomMemberRepository;
    private final ChatMessageRepository chatMessageRepository;
    private final ProjectDataPermissionService projectDataPermissionService;
    private final ChatWebSocketPushService chatWebSocketPushService;
    private final ChatHermesService chatHermesService;
    private final ChatAttachmentService chatAttachmentService;
    private final ChatRoomAgentService chatRoomAgentService;
    private final Executor hermesReplyExecutor;

    @Autowired
    public ChatRoomService(AuthService authService,
                           UserRepository userRepository,
                           ProjectRepository projectRepository,
                           ChatRoomRepository chatRoomRepository,
                           ChatRoomMemberRepository chatRoomMemberRepository,
                           ChatMessageRepository chatMessageRepository,
                           ProjectDataPermissionService projectDataPermissionService,
                           ChatWebSocketPushService chatWebSocketPushService,
                           ChatHermesService chatHermesService,
                           ChatAttachmentService chatAttachmentService,
                           ChatRoomAgentService chatRoomAgentService,
                           @Qualifier("executionTaskExecutor") Executor hermesReplyExecutor) {
        this.authService = authService;
        this.userRepository = userRepository;
        this.projectRepository = projectRepository;
        this.chatRoomRepository = chatRoomRepository;
        this.chatRoomMemberRepository = chatRoomMemberRepository;
        this.chatMessageRepository = chatMessageRepository;
        this.projectDataPermissionService = projectDataPermissionService;
        this.chatWebSocketPushService = chatWebSocketPushService;
        this.chatHermesService = chatHermesService;
        this.chatAttachmentService = chatAttachmentService;
        this.chatRoomAgentService = chatRoomAgentService;
        this.hermesReplyExecutor = hermesReplyExecutor;
    }

    /**
     * 兼容旧测试构造方式；附件服务为空时仅支持无附件消息。
     */
    public ChatRoomService(AuthService authService,
                           UserRepository userRepository,
                           ProjectRepository projectRepository,
                           ChatRoomRepository chatRoomRepository,
                           ChatRoomMemberRepository chatRoomMemberRepository,
                           ChatMessageRepository chatMessageRepository,
                           ProjectDataPermissionService projectDataPermissionService,
                           ChatWebSocketPushService chatWebSocketPushService,
                           ChatHermesService chatHermesService) {
        this(authService, userRepository, projectRepository, chatRoomRepository, chatRoomMemberRepository, chatMessageRepository,
                projectDataPermissionService, chatWebSocketPushService, chatHermesService, null, null, null);
    }

    public ChatRoomService(AuthService authService,
                           UserRepository userRepository,
                           ProjectRepository projectRepository,
                           ChatRoomRepository chatRoomRepository,
                           ChatRoomMemberRepository chatRoomMemberRepository,
                           ChatMessageRepository chatMessageRepository,
                           ProjectDataPermissionService projectDataPermissionService,
                           ChatWebSocketPushService chatWebSocketPushService,
                           ChatHermesService chatHermesService,
                           ChatRoomAgentService chatRoomAgentService) {
        this(authService, userRepository, projectRepository, chatRoomRepository, chatRoomMemberRepository, chatMessageRepository,
                projectDataPermissionService, chatWebSocketPushService, chatHermesService, null, chatRoomAgentService, null);
    }

    public List<ChatRoomSummary> listRooms() {
        CurrentUserInfo currentUser = authService.currentUser();
        return chatRoomRepository.findByArchivedFalseOrderByLastMessageAtDescUpdatedAtDescIdDesc().stream()
                .filter(room -> canAccessRoom(room, currentUser.id()))
                .map(this::toRoomSummary)
                .toList();
    }

    public ChatRoomDetail getRoomDetail(Long roomId) {
        ChatRoomEntity room = requireAccessibleRoom(roomId);
        return new ChatRoomDetail(toRoomSummary(room), listMessages(roomId));
    }

    @Transactional
    public ChatRoomSummary createRoom(CreateChatRoomRequest request) {
        CurrentUserInfo currentUser = authService.currentUser();
        UserEntity creator = userRepository.findById(currentUser.id())
                .orElseThrow(() -> new NoSuchElementException("当前用户不存在"));
        ProjectEntity project = null;
        String visibilityType = VISIBILITY_GLOBAL_INVITE;
        if (request.projectId() != null) {
            project = projectRepository.findById(request.projectId())
                    .orElseThrow(() -> new NoSuchElementException("项目不存在"));
            projectDataPermissionService.requireProjectVisible(project);
            visibilityType = VISIBILITY_PROJECT;
        } else if (request.invitedUserIds().isEmpty()) {
            throw new IllegalArgumentException("全局聊天室至少邀请一名成员");
        }

        ChatRoomEntity room = new ChatRoomEntity();
        room.setTitle(trimToMax(defaultString(request.title()), 120));
        room.setCreatorUser(creator);
        room.setProject(project);
        room.setVisibilityType(visibilityType);
        ChatRoomEntity saved = chatRoomRepository.save(room);

        replaceExplicitMembers(saved, request.invitedUserIds(), creator);
        ChatRoomSummary summary = toRoomSummary(saved);
        chatWebSocketPushService.broadcastRoomUpdated(saved.getId(), summary);
        return summary;
    }

    public List<ChatMessageSummary> listMessages(Long roomId) {
        requireAccessibleRoom(roomId);
        List<ChatMessageEntity> messages = chatMessageRepository.findByRoom_IdOrderByCreatedAtAscIdAsc(roomId);
        Map<Long, List<ChatAttachmentSummary>> attachmentsByMessageId = loadAttachments(messages);
        return messages.stream()
                .map(message -> toMessageSummary(message, attachmentsByMessageId.get(message.getId())))
                .toList();
    }

    @Transactional
    public ChatMessageSummary sendMessage(Long roomId, SendChatMessageRequest request) {
        return sendMessage(roomId, request, List.of());
    }

    @Transactional
    public ChatMessageSummary sendMessage(Long roomId, SendChatMessageRequest request, List<MultipartFile> files) {
        CurrentUserInfo currentUser = authService.currentUser();
        ChatRoomEntity room = requireAccessibleRoom(roomId, currentUser.id());
        UserEntity sender = userRepository.findById(currentUser.id())
                .orElseThrow(() -> new NoSuchElementException("当前用户不存在"));
        String content = defaultString(request.content());
        if (content.isBlank() && (files == null || files.isEmpty()) && request.attachmentAssetIds().isEmpty()) {
            throw new IllegalArgumentException("消息内容或附件不能为空");
        }
        boolean mentionsHermes = containsHermesMention(content);
        ChatMessageEntity message = buildUserMessage(room, sender, content, mentionsHermes);
        ChatMessageEntity saved = chatMessageRepository.save(message);
        if (chatAttachmentService != null) {
            chatAttachmentService.bindUploads(saved, files);
            chatAttachmentService.bindExistingAssets(saved, request.attachmentAssetIds());
        }
        refreshRoomPreview(room, content.isBlank() ? "[附件]" : content);
        chatRoomRepository.save(room);
        ChatMessageSummary summary = toMessageSummary(saved);
        chatWebSocketPushService.broadcastMessageCreated(roomId, summary);
        if (chatRoomAgentService != null) {
            chatRoomAgentService.handleUserMessageCreated(roomId, saved.getId());
        }

        if (mentionsHermes) {
            ChatMessageEntity assistantMessage = buildAssistantPlaceholder(room);
            assistantMessage = chatMessageRepository.save(assistantMessage);
            ChatMessageSummary assistantSummary = toMessageSummary(assistantMessage);
            chatWebSocketPushService.broadcastMessageCreated(roomId, assistantSummary);
            startHermesReplyAfterCommit(roomId, assistantMessage.getId(), saved.getId(), currentUser.id());
        }
        return summary;
    }

    /**
     * Hermes 回复在事务提交后异步执行。
     * 业务意图：REST 发送消息只负责落库和广播占位消息，模型流式输出由后台任务继续推送，避免请求线程被长回复占满。
     */
    private void startHermesReplyAfterCommit(Long roomId, Long assistantMessageId, Long triggerMessageId, Long triggerUserId) {
        Runnable task = () -> {
            if (chatRoomAgentService != null) {
                chatRoomAgentService.createMentionTask(roomId, assistantMessageId, triggerMessageId, triggerUserId);
            } else {
                chatHermesService.startHermesReply(roomId, assistantMessageId, triggerMessageId);
            }
        };
        if (hermesReplyExecutor == null) {
            task.run();
            return;
        }
        Runnable dispatch = () -> hermesReplyExecutor.execute(task);
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    dispatch.run();
                }
            });
        } else {
            dispatch.run();
        }
    }

    @Transactional
    public ChatRoomSummary updateMembers(Long roomId, UpdateChatRoomMembersRequest request) {
        CurrentUserInfo currentUser = authService.currentUser();
        ChatRoomEntity room = requireAccessibleRoom(roomId, currentUser.id());
        boolean roomCreator = room.getCreatorUser() != null && currentUser.id().equals(room.getCreatorUser().getId());
        LinkedHashSet<Long> requestedMemberIds = new LinkedHashSet<>(request.memberUserIds());
        Set<Long> existingExplicitMemberIds = chatRoomMemberRepository.findByRoom_IdOrderByIdAsc(room.getId()).stream()
                .map(ChatRoomMemberEntity::getUser)
                .map(UserEntity::getId)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        if (!roomCreator && !requestedMemberIds.containsAll(existingExplicitMemberIds)) {
            throw new ForbiddenException("只有群主可以移除成员");
        }
        replaceExplicitMembers(room, List.copyOf(requestedMemberIds), room.getCreatorUser());
        ChatRoomSummary summary = toRoomSummary(room);
        chatWebSocketPushService.broadcastRoomUpdated(roomId, summary);
        return summary;
    }

    public boolean canAccessRoom(Long roomId, Long userId) {
        return chatRoomRepository.findById(roomId)
                .map(room -> canAccessRoom(room, userId))
                .orElse(false);
    }

    public ChatRoomEntity requireAccessibleRoom(Long roomId) {
        CurrentUserInfo currentUser = authService.currentUser();
        return requireAccessibleRoom(roomId, currentUser.id());
    }

    public ChatRoomEntity requireAccessibleRoom(Long roomId, Long userId) {
        ChatRoomEntity room = chatRoomRepository.findById(roomId)
                .orElseThrow(() -> new NoSuchElementException("聊天室不存在"));
        if (!canAccessRoom(room, userId)) {
            throw new ForbiddenException("无权访问该聊天室");
        }
        return room;
    }

    public ChatMessageSummary toMessageSummary(ChatMessageEntity message) {
        return toMessageSummary(message, List.of());
    }

    public ChatMessageSummary toMessageSummary(ChatMessageEntity message, List<ChatAttachmentSummary> attachments) {
        UserEntity sender = message.getSenderUser();
        return new ChatMessageSummary(
                message.getId(),
                message.getRoom() == null ? null : message.getRoom().getId(),
                normalizeRole(message.getRole()),
                sender == null ? null : sender.getId(),
                defaultString(message.getSenderUsernameSnapshot()),
                defaultString(message.getSenderNameSnapshot()),
                defaultString(message.getSenderAvatarSnapshot()),
                defaultString(message.getContent()),
                normalizeMessageStatus(message.getStatus()).toLowerCase(),
                message.isMentionsHermes(),
                attachments,
                message.getAgentTask() == null ? null : message.getAgentTask().getId(),
                message.getAgentTask() == null ? "" : defaultString(message.getAgentTask().getStatus()).toLowerCase(),
                List.of(),
                List.of(),
                formatTime(message.getCreatedAt()),
                formatTime(message.getUpdatedAt())
        );
    }

    public ChatRoomSummary toRoomSummary(ChatRoomEntity room) {
        ProjectEntity project = room.getProject();
        UserEntity creator = room.getCreatorUser();
        return new ChatRoomSummary(
                room.getId(),
                defaultString(room.getTitle()),
                defaultString(room.getVisibilityType()),
                project == null ? null : project.getId(),
                project == null ? "" : defaultString(project.getName()),
                creator == null ? null : creator.getId(),
                creator == null ? "" : displayName(creator),
                defaultString(room.getLatestPreview()),
                defaultString(room.getHistorySummary()),
                room.isArchived(),
                loadMembers(room),
                formatTime(room.getCreatedAt()),
                formatTime(room.getUpdatedAt()),
                formatTime(room.getLastMessageAt())
        );
    }

    public static boolean containsHermesMention(String content) {
        return content != null && HERMES_MENTION_PATTERN.matcher(content).find();
    }

    private boolean canAccessRoom(ChatRoomEntity room, Long userId) {
        if (room == null || userId == null || room.isArchived()) {
            return false;
        }
        if (VISIBILITY_PROJECT.equals(room.getVisibilityType())) {
            return chatRoomMemberRepository.existsByRoom_IdAndUser_Id(room.getId(), userId)
                    || projectDataPermissionService.isProjectVisible(room.getProject());
        }
        if (room.getCreatorUser() != null && userId.equals(room.getCreatorUser().getId())) {
            return true;
        }
        return chatRoomMemberRepository.existsByRoom_IdAndUser_Id(room.getId(), userId);
    }

    /**
     * 保存房间显式邀请成员。
     * 业务意图：全局房间必须把创建者写入成员表；项目房间不复制项目参与人，只记录额外邀请的人。
     */
    private void replaceExplicitMembers(ChatRoomEntity room, List<Long> invitedUserIds, UserEntity creator) {
        LinkedHashSet<Long> memberIds = new LinkedHashSet<>(invitedUserIds == null ? List.of() : invitedUserIds);
        if (!VISIBILITY_PROJECT.equals(room.getVisibilityType()) && creator != null) {
            memberIds.add(creator.getId());
        }
        chatRoomMemberRepository.deleteByRoom_Id(room.getId());
        if (memberIds.isEmpty()) {
            return;
        }
        List<UserEntity> users = userRepository.findAllById(memberIds);
        if (users.size() != memberIds.size()) {
            throw new NoSuchElementException("部分邀请成员不存在");
        }
        List<ChatRoomMemberEntity> members = users.stream()
                .map(user -> {
                    ChatRoomMemberEntity member = new ChatRoomMemberEntity();
                    member.setRoom(room);
                    member.setUser(user);
                    member.setRole(creator != null && user.getId().equals(creator.getId()) ? "OWNER" : "MEMBER");
                    return member;
                })
                .toList();
        chatRoomMemberRepository.saveAll(members);
    }

    private ChatMessageEntity buildUserMessage(ChatRoomEntity room, UserEntity sender, String content, boolean mentionsHermes) {
        ChatMessageEntity message = new ChatMessageEntity();
        message.setRoom(room);
        message.setSenderUser(sender);
        message.setRole(ROLE_USER);
        message.setSenderUsernameSnapshot(defaultString(sender.getUsername()));
        message.setSenderNameSnapshot(displayName(sender));
        message.setSenderAvatarSnapshot(defaultString(sender.getAvatarUrl()));
        message.setContent(content);
        message.setStatus(STATUS_DONE);
        message.setMentionsHermes(mentionsHermes);
        return message;
    }

    private ChatMessageEntity buildAssistantPlaceholder(ChatRoomEntity room) {
        ChatMessageEntity message = new ChatMessageEntity();
        message.setRoom(room);
        message.setSenderUser(null);
        message.setRole(ROLE_ASSISTANT);
        message.setSenderUsernameSnapshot("hermes");
        message.setSenderNameSnapshot("Hermes");
        message.setSenderAvatarSnapshot("");
        message.setContent("");
        message.setStatus(STATUS_STREAMING);
        message.setMentionsHermes(false);
        return message;
    }

    private void refreshRoomPreview(ChatRoomEntity room, String content) {
        room.setLatestPreview(trimToMax(defaultString(content), MAX_PREVIEW_LENGTH));
        room.setLastMessageAt(LocalDateTime.now());
    }

    private List<ChatMemberSummary> loadMembers(ChatRoomEntity room) {
        if (room == null || room.getId() == null) {
            return List.of();
        }
        if (VISIBILITY_PROJECT.equals(room.getVisibilityType()) && room.getProject() != null) {
            Set<Long> participantIds = projectDataPermissionService.resolveParticipantUserIds(room.getProject());
            Map<Long, ChatMemberSummary> memberMap = new LinkedHashMap<>();
            userRepository.findAllById(participantIds).stream()
                    .map(user -> toMemberSummary(user, "PROJECT"))
                    .forEach(member -> memberMap.put(member.userId(), member));
            chatRoomMemberRepository.findByRoom_IdOrderByIdAsc(room.getId()).stream()
                    .map(member -> toMemberSummary(member.getUser(), member.getRole()))
                    .forEach(member -> memberMap.putIfAbsent(member.userId(), member));
            return List.copyOf(memberMap.values());
        }
        return chatRoomMemberRepository.findByRoom_IdOrderByIdAsc(room.getId()).stream()
                .map(member -> toMemberSummary(member.getUser(), member.getRole()))
                .toList();
    }

    private ChatMemberSummary toMemberSummary(UserEntity user, String role) {
        return new ChatMemberSummary(
                user.getId(),
                defaultString(user.getUsername()),
                displayName(user),
                defaultString(user.getAvatarUrl()),
                defaultString(role)
        );
    }

    private Map<Long, List<ChatAttachmentSummary>> loadAttachments(List<ChatMessageEntity> messages) {
        if (chatAttachmentService == null || messages == null || messages.isEmpty()) {
            return Map.of();
        }
        return chatAttachmentService.loadMessageAttachments(messages.stream().map(ChatMessageEntity::getId).toList());
    }

    private String displayName(UserEntity user) {
        if (user == null) {
            return "";
        }
        return defaultString(user.getNickname()).isBlank() ? defaultString(user.getUsername()) : defaultString(user.getNickname());
    }

    private String normalizeRole(String role) {
        return ROLE_ASSISTANT.equalsIgnoreCase(defaultString(role)) ? ROLE_ASSISTANT : ROLE_USER;
    }

    private String normalizeMessageStatus(String status) {
        String normalized = defaultString(status).toUpperCase();
        if (STATUS_ERROR.equals(normalized)) {
            return STATUS_ERROR;
        }
        if (STATUS_STREAMING.equals(normalized)) {
            return STATUS_STREAMING;
        }
        return STATUS_DONE;
    }

    private String formatTime(LocalDateTime time) {
        return time == null ? null : time.format(TIME_FORMATTER);
    }

    private String trimToMax(String value, int maxLength) {
        String normalized = defaultString(value);
        if (normalized.length() <= maxLength) {
            return normalized;
        }
        return normalized.substring(0, maxLength);
    }

    private String defaultString(String value) {
        return value == null ? "" : value.trim();
    }
}
