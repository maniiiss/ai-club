package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ChatMessageEntity;
import com.aiclub.platform.domain.model.ChatRoomEntity;
import com.aiclub.platform.domain.model.PermissionEntity;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.RoleEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.ChatMessageSummary;
import com.aiclub.platform.dto.CurrentUserInfo;
import com.aiclub.platform.dto.HermesConversationContextSnapshot;
import com.aiclub.platform.dto.HermesConversationRequestSnapshot;
import com.aiclub.platform.dto.HermesConversationState;
import com.aiclub.platform.dto.HermesConversationTurn;
import com.aiclub.platform.dto.HermesGroundingState;
import com.aiclub.platform.repository.ChatMessageRepository;
import com.aiclub.platform.repository.ChatRoomRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 聊天室 @Hermes 回复服务。
 * 业务意图：让 Hermes 作为房间成员发言，同时用“历史摘要 + 最近明细 + 附件摘录”模拟整房间历史理解。
 */
@Service
public class ChatHermesService {

    private static final int MAX_SUMMARY_LENGTH = 4000;

    private final ChatRoomRepository chatRoomRepository;
    private final ChatMessageRepository chatMessageRepository;
    private final HermesGatewayService hermesGatewayService;
    private final ChatWebSocketPushService chatWebSocketPushService;
    private final ChatAttachmentService chatAttachmentService;
    private final HermesConversationStateStore hermesConversationStateStore;
    private final HermesMcpSessionTokenService hermesMcpSessionTokenService;
    private final Set<Long> runningRoomIds = ConcurrentHashMap.newKeySet();

    @Autowired
    public ChatHermesService(ChatRoomRepository chatRoomRepository,
                             ChatMessageRepository chatMessageRepository,
                             HermesGatewayService hermesGatewayService,
                             ChatWebSocketPushService chatWebSocketPushService,
                             ChatAttachmentService chatAttachmentService,
                             HermesConversationStateStore hermesConversationStateStore,
                             HermesMcpSessionTokenService hermesMcpSessionTokenService) {
        this.chatRoomRepository = chatRoomRepository;
        this.chatMessageRepository = chatMessageRepository;
        this.hermesGatewayService = hermesGatewayService;
        this.chatWebSocketPushService = chatWebSocketPushService;
        this.chatAttachmentService = chatAttachmentService;
        this.hermesConversationStateStore = hermesConversationStateStore;
        this.hermesMcpSessionTokenService = hermesMcpSessionTokenService;
    }

    /**
     * 兼容单元测试构造方式。
     */
    public ChatHermesService(ChatRoomRepository chatRoomRepository,
                             ChatMessageRepository chatMessageRepository,
                             HermesGatewayService hermesGatewayService,
                             ChatWebSocketPushService chatWebSocketPushService) {
        this(chatRoomRepository, chatMessageRepository, hermesGatewayService, chatWebSocketPushService, null, null, null);
    }

    @Transactional
    public void startHermesReply(Long roomId, Long assistantMessageId, Long triggerMessageId) {
        if (!runningRoomIds.add(roomId)) {
            markAssistantError(roomId, assistantMessageId, "Hermes 正在回复中，请稍后再试");
            return;
        }
        try {
            ChatRoomEntity room = chatRoomRepository.findById(roomId)
                    .orElseThrow(() -> new NoSuchElementException("聊天室不存在"));
            ChatMessageEntity assistantMessage = chatMessageRepository.findById(assistantMessageId)
                    .orElseThrow(() -> new NoSuchElementException("Hermes 消息不存在"));
            ChatMessageEntity triggerMessage = chatMessageRepository.findById(triggerMessageId)
                    .orElseThrow(() -> new NoSuchElementException("触发消息不存在"));

            PreparedChatHermesSession preparedSession = prepareMcpSession(room, triggerMessage);
            List<HermesConversationTurn> transcript = buildTranscript(room, triggerMessage);
            StringBuilder streamedContent = new StringBuilder();
            HermesGatewayService.HermesGatewayResult result = hermesGatewayService.streamChatCompletion(
                    buildPrompt(room, preparedSession.sessionToken()),
                    transcript,
                    delta -> {
                        streamedContent.append(delta == null ? "" : delta);
                        chatWebSocketPushService.broadcastHermesDelta(roomId, assistantMessageId, delta == null ? "" : delta);
                    }
            );
            String content = hasText(result.content()) ? result.content() : streamedContent.toString();
            assistantMessage.setContent(content);
            assistantMessage.setStatus(ChatRoomService.STATUS_DONE);
            assistantMessage.setUpdatedAt(LocalDateTime.now());
            chatMessageRepository.save(assistantMessage);
            refreshRoomAfterHermes(room, content);
            chatRoomRepository.save(room);
            chatWebSocketPushService.broadcastHermesMessageDone(roomId, toAssistantSummary(assistantMessage));
        } catch (Exception exception) {
            markAssistantError(roomId, assistantMessageId, resolveErrorMessage(exception));
        } finally {
            runningRoomIds.remove(roomId);
        }
    }

    /**
     * 执行聊天室主动 Agent 任务。
     * 业务意图：主动总结、关键字监听和任务状态回写没有用户 @hermes 触发消息，
     * 但仍需要复用同一套房间上下文、MCP 会话令牌和流式消息收口。
     */
    @Transactional
    public void startAgentTaskReply(Long roomId, Long assistantMessageId, String taskInstruction, UserEntity authorizedByUser) {
        if (!runningRoomIds.add(roomId)) {
            markAssistantError(roomId, assistantMessageId, "Hermes 正在回复中，请稍后再试");
            return;
        }
        try {
            ChatRoomEntity room = chatRoomRepository.findById(roomId)
                    .orElseThrow(() -> new NoSuchElementException("聊天室不存在"));
            ChatMessageEntity assistantMessage = chatMessageRepository.findById(assistantMessageId)
                    .orElseThrow(() -> new NoSuchElementException("Hermes 消息不存在"));

            PreparedChatHermesSession preparedSession = prepareMcpSessionForAgentTask(room, authorizedByUser, assistantMessageId, taskInstruction);
            List<HermesConversationTurn> transcript = buildAgentTaskTranscript(room, taskInstruction);
            StringBuilder streamedContent = new StringBuilder();
            HermesGatewayService.HermesGatewayResult result = hermesGatewayService.streamChatCompletion(
                    buildPrompt(room, preparedSession.sessionToken()),
                    transcript,
                    delta -> {
                        streamedContent.append(delta == null ? "" : delta);
                        chatWebSocketPushService.broadcastHermesDelta(roomId, assistantMessageId, delta == null ? "" : delta);
                    }
            );
            String content = hasText(result.content()) ? result.content() : streamedContent.toString();
            assistantMessage.setContent(content);
            assistantMessage.setStatus(ChatRoomService.STATUS_DONE);
            assistantMessage.setUpdatedAt(LocalDateTime.now());
            chatMessageRepository.save(assistantMessage);
            refreshRoomAfterHermes(room, content);
            chatRoomRepository.save(room);
            chatWebSocketPushService.broadcastHermesMessageDone(roomId, toAssistantSummary(assistantMessage));
        } catch (Exception exception) {
            markAssistantError(roomId, assistantMessageId, resolveErrorMessage(exception));
        } finally {
            runningRoomIds.remove(roomId);
        }
    }

    private List<HermesConversationTurn> buildTranscript(ChatRoomEntity room, ChatMessageEntity triggerMessage) {
        List<ChatMessageEntity> recentMessages = new ArrayList<>(
                chatMessageRepository.findTop80ByRoom_IdOrderByCreatedAtDescIdDesc(room.getId())
        );
        Collections.reverse(recentMessages);
        StringBuilder roomContext = new StringBuilder();
        roomContext.append("房间：").append(defaultString(room.getTitle())).append('\n');
        if (room.getProject() != null) {
            roomContext.append("绑定项目：").append(defaultString(room.getProject().getName()))
                    .append(" #").append(room.getProject().getId()).append('\n');
        }
        roomContext.append("历史摘要：").append(defaultString(room.getHistorySummary()).isBlank() ? "暂无" : defaultString(room.getHistorySummary()));
        String attachmentContext = chatAttachmentService == null ? "" : chatAttachmentService.buildRoomAttachmentContextMarkdown(room.getId());
        if (hasText(attachmentContext)) {
            roomContext.append("\n\n").append(attachmentContext);
        }

        List<HermesConversationTurn> transcript = new ArrayList<>();
        transcript.add(HermesConversationTurn.user(roomContext.toString()));
        for (ChatMessageEntity message : recentMessages) {
            String speaker = resolveSpeaker(message);
            String line = speaker + "：" + defaultString(message.getContent());
            if (ChatRoomService.ROLE_ASSISTANT.equalsIgnoreCase(message.getRole())) {
                transcript.add(HermesConversationTurn.assistant(line));
            } else {
                transcript.add(HermesConversationTurn.user(line));
            }
        }
        transcript.add(HermesConversationTurn.user("请回应这条 @Hermes 请求：" + defaultString(triggerMessage.getContent())));
        return transcript;
    }

    private List<HermesConversationTurn> buildAgentTaskTranscript(ChatRoomEntity room, String taskInstruction) {
        List<ChatMessageEntity> recentMessages = new ArrayList<>(
                chatMessageRepository.findTop80ByRoom_IdOrderByCreatedAtDescIdDesc(room.getId())
        );
        Collections.reverse(recentMessages);
        List<HermesConversationTurn> transcript = new ArrayList<>();
        transcript.add(HermesConversationTurn.user(buildRoomContext(room)));
        for (ChatMessageEntity message : recentMessages) {
            String line = resolveSpeaker(message) + "：" + defaultString(message.getContent());
            if (ChatRoomService.ROLE_ASSISTANT.equalsIgnoreCase(message.getRole())) {
                transcript.add(HermesConversationTurn.assistant(line));
            } else {
                transcript.add(HermesConversationTurn.user(line));
            }
        }
        transcript.add(HermesConversationTurn.user(defaultString(taskInstruction)));
        return transcript;
    }

    /**
     * 为聊天室 @Hermes 准备 MCP 可恢复会话态。
     * 业务意图：聊天室回复不走标准 Hermes 会话页，但模型仍可能调用平台 MCP 工具，因此这里补齐一次性 token 与 Redis 状态。
     */
    private PreparedChatHermesSession prepareMcpSession(ChatRoomEntity room, ChatMessageEntity triggerMessage) {
        if (hermesConversationStateStore == null || hermesMcpSessionTokenService == null) {
            return new PreparedChatHermesSession("");
        }
        CurrentUserInfo currentUser = toCurrentUserInfo(triggerMessage.getSenderUser());
        String clientConversationId = "chat-room-" + room.getId() + "-message-" + triggerMessage.getId();
        String scopeKey = "chat-room:" + room.getId() + ":user:" + currentUser.id() + ":message:" + triggerMessage.getId();
        String sessionToken = hermesMcpSessionTokenService.issueToken(currentUser, scopeKey, clientConversationId);
        ProjectEntity project = room.getProject();
        Long projectId = project == null ? null : project.getId();
        String contextMarkdown = buildChatRoomContextMarkdown(room);
        HermesConversationState state = new HermesConversationState(
                scopeKey,
                clientConversationId,
                currentUser,
                new HermesConversationContextSnapshot(
                        "chat-room",
                        projectId,
                        null,
                        null,
                        null,
                        resolveRoleName(currentUser),
                        List.of(),
                        List.of(),
                        contextMarkdown
                ),
                new HermesConversationRequestSnapshot(
                        defaultString(triggerMessage.getContent()),
                        "chat-room",
                        projectId,
                        null,
                        null,
                        null,
                        null,
                        null,
                        List.of()
                ),
                sessionToken,
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                HermesGroundingState.empty(),
                List.of(),
                ""
        );
        hermesConversationStateStore.save(state);
        return new PreparedChatHermesSession(sessionToken);
    }

    private PreparedChatHermesSession prepareMcpSessionForAgentTask(ChatRoomEntity room,
                                                                    UserEntity authorizedByUser,
                                                                    Long assistantMessageId,
                                                                    String taskInstruction) {
        if (hermesConversationStateStore == null || hermesMcpSessionTokenService == null) {
            return new PreparedChatHermesSession("");
        }
        CurrentUserInfo currentUser = toCurrentUserInfo(authorizedByUser == null ? room.getCreatorUser() : authorizedByUser);
        String clientConversationId = "chat-room-" + room.getId() + "-agent-task-" + assistantMessageId;
        String scopeKey = "chat-room:" + room.getId() + ":agent-task:" + assistantMessageId + ":user:" + currentUser.id();
        String sessionToken = hermesMcpSessionTokenService.issueToken(currentUser, scopeKey, clientConversationId);
        ProjectEntity project = room.getProject();
        Long projectId = project == null ? null : project.getId();
        HermesConversationState state = new HermesConversationState(
                scopeKey,
                clientConversationId,
                currentUser,
                new HermesConversationContextSnapshot(
                        "chat-room",
                        projectId,
                        null,
                        null,
                        null,
                        resolveRoleName(currentUser),
                        List.of(),
                        List.of(),
                        buildChatRoomContextMarkdown(room)
                ),
                new HermesConversationRequestSnapshot(
                        defaultString(taskInstruction),
                        "chat-room",
                        projectId,
                        null,
                        null,
                        null,
                        null,
                        null,
                        List.of()
                ),
                sessionToken,
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                HermesGroundingState.empty(),
                List.of(),
                ""
        );
        hermesConversationStateStore.save(state);
        return new PreparedChatHermesSession(sessionToken);
    }

    private HermesPromptBuilder.HermesPrompt buildPrompt(ChatRoomEntity room, String sessionToken) {
        String systemPrompt = """
                你是 AI Club 聊天室中的 Hermes 助手。
                你需要像团队成员一样基于房间历史、项目上下文和附件摘录进行回复。
                输出必须简洁、可执行；如果是在总结或汇总，请保留关键结论、风险和下一步。
                当前轮唯一有效的 `system_session_token` 是：`%s`
                每次调用平台 MCP 工具必须原样传入 `system_session_token` = "%s"。
                这个令牌是系统内部值，禁止从用户问题中提取或猜测，禁止在自然语言回答中输出。
                如果工具报 token 相关错误，直接用这个值重试同一个工具调用，不要向用户解释 token。
                """;
        String userPrompt = "当前聊天室：" + defaultString(room.getTitle());
        return new HermesPromptBuilder.HermesPrompt(systemPrompt.formatted(defaultString(sessionToken), defaultString(sessionToken)).trim(), userPrompt);
    }

    private String buildRoomContext(ChatRoomEntity room) {
        StringBuilder roomContext = new StringBuilder();
        roomContext.append("房间：").append(defaultString(room.getTitle())).append('\n');
        if (room.getProject() != null) {
            roomContext.append("绑定项目：").append(defaultString(room.getProject().getName()))
                    .append(" #").append(room.getProject().getId()).append('\n');
        }
        roomContext.append("历史摘要：").append(defaultString(room.getHistorySummary()).isBlank() ? "暂无" : defaultString(room.getHistorySummary()));
        String attachmentContext = chatAttachmentService == null ? "" : chatAttachmentService.buildRoomAttachmentContextMarkdown(room.getId());
        if (hasText(attachmentContext)) {
            roomContext.append("\n\n").append(attachmentContext);
        }
        return roomContext.toString();
    }

    private void refreshRoomAfterHermes(ChatRoomEntity room, String content) {
        room.setLatestPreview(trimToMax(defaultString(content), 500));
        String nextSummary = buildNextSummary(room.getHistorySummary(), content);
        room.setHistorySummary(nextSummary);
        room.setLastMessageAt(LocalDateTime.now());
    }

    private String buildNextSummary(String existingSummary, String latestContent) {
        String combined = (defaultString(existingSummary) + "\n" + defaultString(latestContent)).trim();
        if (combined.length() <= MAX_SUMMARY_LENGTH) {
            return combined;
        }
        return combined.substring(combined.length() - MAX_SUMMARY_LENGTH);
    }

    private void markAssistantError(Long roomId, Long assistantMessageId, String message) {
        ChatMessageEntity assistantMessage = chatMessageRepository.findById(assistantMessageId).orElse(null);
        if (assistantMessage == null) {
            return;
        }
        assistantMessage.setContent(defaultString(message));
        assistantMessage.setStatus(ChatRoomService.STATUS_ERROR);
        assistantMessage.setUpdatedAt(LocalDateTime.now());
        chatMessageRepository.save(assistantMessage);
        chatWebSocketPushService.broadcastHermesMessageError(roomId, toAssistantSummary(assistantMessage));
    }

    private ChatMessageSummary toAssistantSummary(ChatMessageEntity message) {
        return new ChatMessageSummary(
                message.getId(),
                message.getRoom() == null ? null : message.getRoom().getId(),
                ChatRoomService.ROLE_ASSISTANT,
                null,
                "hermes",
                "Hermes",
                "",
                defaultString(message.getContent()),
                defaultString(message.getStatus()).toLowerCase(),
                false,
                List.of(),
                message.getCreatedAt() == null ? null : message.getCreatedAt().toString(),
                message.getUpdatedAt() == null ? null : message.getUpdatedAt().toString()
        );
    }

    private String resolveSpeaker(ChatMessageEntity message) {
        if (ChatRoomService.ROLE_ASSISTANT.equalsIgnoreCase(message.getRole())) {
            return "Hermes";
        }
        if (hasText(message.getSenderNameSnapshot())) {
            return message.getSenderNameSnapshot();
        }
        return defaultString(message.getSenderUsernameSnapshot()).isBlank() ? "成员" : defaultString(message.getSenderUsernameSnapshot());
    }

    private CurrentUserInfo toCurrentUserInfo(UserEntity user) {
        if (user == null || user.getId() == null) {
            throw new IllegalStateException("触发 @Hermes 的用户信息缺失，无法生成 MCP 会话令牌");
        }
        List<RoleEntity> roles = user.getRoles() == null
                ? List.of()
                : user.getRoles().stream()
                .filter(role -> role != null && role.isEnabled())
                .sorted(Comparator.comparing(role -> defaultString(role.getCode())))
                .toList();
        List<String> roleCodes = roles.stream().map(RoleEntity::getCode).filter(this::hasText).toList();
        List<String> roleNames = roles.stream().map(RoleEntity::getName).filter(this::hasText).toList();
        List<String> permissionCodes = roles.stream()
                .flatMap(role -> role.getPermissions() == null ? java.util.stream.Stream.<PermissionEntity>empty() : role.getPermissions().stream())
                .filter(permission -> permission != null && permission.isEnabled() && hasText(permission.getCode()))
                .map(PermissionEntity::getCode)
                .distinct()
                .sorted()
                .toList();
        return new CurrentUserInfo(
                user.getId(),
                defaultString(user.getUsername()),
                defaultString(user.getNickname()),
                defaultString(user.getEmail()),
                defaultString(user.getPhone()),
                defaultString(user.getGitlabUsername()),
                defaultString(user.getAvatarUrl()),
                user.isEnabled(),
                roleCodes,
                roleNames,
                permissionCodes
        );
    }

    private String resolveRoleName(CurrentUserInfo currentUser) {
        if (currentUser != null && currentUser.roleNames() != null && !currentUser.roleNames().isEmpty()) {
            return defaultString(currentUser.roleNames().get(0));
        }
        return "聊天室成员";
    }

    private String buildChatRoomContextMarkdown(ChatRoomEntity room) {
        StringBuilder builder = new StringBuilder();
        builder.append("- 聊天室：").append(defaultString(room.getTitle()));
        if (room.getProject() != null) {
            builder.append("\n- 绑定项目：")
                    .append(defaultString(room.getProject().getName()))
                    .append(" #")
                    .append(room.getProject().getId());
        }
        return builder.toString();
    }

    private String resolveErrorMessage(Exception exception) {
        if (exception == null || exception.getMessage() == null || exception.getMessage().isBlank()) {
            return "Hermes 助手暂时不可用";
        }
        return exception.getMessage().trim();
    }

    private String trimToMax(String value, int maxLength) {
        String normalized = defaultString(value);
        return normalized.length() <= maxLength ? normalized : normalized.substring(0, maxLength);
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private String defaultString(String value) {
        return value == null ? "" : value.trim();
    }

    private record PreparedChatHermesSession(String sessionToken) {
    }
}
