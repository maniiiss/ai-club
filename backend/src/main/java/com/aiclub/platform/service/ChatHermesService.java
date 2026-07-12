package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ChatMessageEntity;
import com.aiclub.platform.domain.model.ChatRoomEntity;
import com.aiclub.platform.domain.model.PermissionEntity;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.RoleEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.ChatMessageSummary;
import com.aiclub.platform.dto.CurrentUserInfo;
import com.aiclub.platform.dto.HermesActionSummary;
import com.aiclub.platform.dto.HermesChatRoomAgentTaskResult;
import com.aiclub.platform.dto.HermesConversationContextSnapshot;
import com.aiclub.platform.dto.HermesConversationRequestSnapshot;
import com.aiclub.platform.dto.HermesConversationState;
import com.aiclub.platform.dto.HermesConversationTurn;
import com.aiclub.platform.dto.HermesGroundingState;
import com.aiclub.platform.dto.HermesGroundingTarget;
import com.aiclub.platform.dto.HermesSelectionCard;
import com.aiclub.platform.dto.HermesSelectionOption;
import com.aiclub.platform.dto.HermesToolExecutionPolicy;
import com.aiclub.platform.dto.request.HermesSelectionRequest;
import com.aiclub.platform.repository.ChatMessageRepository;
import com.aiclub.platform.repository.ChatRoomRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 聊天室 @Hermes 回复服务。
 * 业务意图：让 Hermes 作为房间成员发言，同时用“历史摘要 + 最近明细 + 附件摘录”模拟整房间历史理解。
 */
@Service
public class ChatHermesService {

    private static final int MAX_SUMMARY_LENGTH = 4000;
    private static final Pattern QUOTED_TITLE_PATTERN = Pattern.compile("(?:需求)?标题是[“\"]([^”\"]+)[”\"]");
    private static final Pattern PLAIN_TITLE_PATTERN = Pattern.compile("(?:需求)?标题是[：:\\s]*([^，。；;\\n]+)");
    private static final Pattern QUOTED_CONTENT_PATTERN = Pattern.compile("内容是[“\"]([^”\"]+)[”\"]");
    private static final Pattern PLAIN_CONTENT_PATTERN = Pattern.compile("内容是[：:\\s]*([^，。；;\\n]+)");
    private static final Pattern ITERATION_ID_IN_TEXT_PATTERN = Pattern.compile("迭代[^\\n。；;]{0,40}(?:\\(|（)\\s*ID[:：]?\\s*(\\d+)\\s*(?:\\)|）)");
    private static final Pattern ITERATION_ID_FIELD_PATTERN = Pattern.compile("(?:iterationId|迭代ID)[：:\\s]*(\\d+)", Pattern.CASE_INSENSITIVE);

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
        startHermesReply(roomId, assistantMessageId, triggerMessageId, HermesToolExecutionPolicy.empty());
    }

    /**
     * 执行聊天室 Agent 的 @Hermes 回复，并返回 MCP tool calling 写入的最终展示态。
     */
    @Transactional
    public HermesChatRoomAgentTaskResult startHermesReply(Long roomId,
                                                          Long assistantMessageId,
                                                          Long triggerMessageId,
                                                          HermesToolExecutionPolicy toolExecutionPolicy) {
        if (!runningRoomIds.add(roomId)) {
            markAssistantError(roomId, assistantMessageId, "Hermes 正在回复中，请稍后再试");
            return HermesChatRoomAgentTaskResult.empty("Hermes 正在回复中，请稍后再试");
        }
        try {
            ChatRoomEntity room = chatRoomRepository.findById(roomId)
                    .orElseThrow(() -> new NoSuchElementException("聊天室不存在"));
            ChatMessageEntity assistantMessage = chatMessageRepository.findById(assistantMessageId)
                    .orElseThrow(() -> new NoSuchElementException("Hermes 消息不存在"));
            ChatMessageEntity triggerMessage = chatMessageRepository.findById(triggerMessageId)
                    .orElseThrow(() -> new NoSuchElementException("触发消息不存在"));

            PreparedChatHermesSession preparedSession = prepareMcpSession(room, triggerMessage, toolExecutionPolicy);
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
            return toAgentTaskResult(preparedSession, content);
        } catch (Exception exception) {
            markAssistantError(roomId, assistantMessageId, resolveErrorMessage(exception));
            return HermesChatRoomAgentTaskResult.empty(resolveErrorMessage(exception));
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
        startAgentTaskReply(roomId, assistantMessageId, taskInstruction, authorizedByUser, HermesToolExecutionPolicy.empty());
    }

    /**
     * 执行聊天室主动 Agent 任务，并返回 Hermes 原生 tool calling 的最终展示态。
     */
    @Transactional
    public HermesChatRoomAgentTaskResult startAgentTaskReply(Long roomId,
                                                             Long assistantMessageId,
                                                             String taskInstruction,
                                                             UserEntity authorizedByUser,
                                                             HermesToolExecutionPolicy toolExecutionPolicy) {
        return startAgentTaskReply(roomId, assistantMessageId, taskInstruction, authorizedByUser, toolExecutionPolicy, HermesGroundingState.empty());
    }

    @Transactional
    public HermesChatRoomAgentTaskResult startAgentTaskReply(Long roomId,
                                                             Long assistantMessageId,
                                                             String taskInstruction,
                                                             UserEntity authorizedByUser,
                                                             HermesToolExecutionPolicy toolExecutionPolicy,
                                                             HermesGroundingState groundingState) {
        if (!runningRoomIds.add(roomId)) {
            markAssistantError(roomId, assistantMessageId, "Hermes 正在回复中，请稍后再试");
            return HermesChatRoomAgentTaskResult.empty("Hermes 正在回复中，请稍后再试");
        }
        try {
            ChatRoomEntity room = chatRoomRepository.findById(roomId)
                    .orElseThrow(() -> new NoSuchElementException("聊天室不存在"));
            ChatMessageEntity assistantMessage = chatMessageRepository.findById(assistantMessageId)
                    .orElseThrow(() -> new NoSuchElementException("Hermes 消息不存在"));

            PreparedChatHermesSession preparedSession = prepareMcpSessionForAgentTask(room, authorizedByUser, assistantMessageId, taskInstruction, toolExecutionPolicy, groundingState);
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
            return toAgentTaskResult(preparedSession, content);
        } catch (Exception exception) {
            markAssistantError(roomId, assistantMessageId, resolveErrorMessage(exception));
            return HermesChatRoomAgentTaskResult.empty(resolveErrorMessage(exception));
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
    private PreparedChatHermesSession prepareMcpSession(ChatRoomEntity room,
                                                        ChatMessageEntity triggerMessage,
                                                        HermesToolExecutionPolicy toolExecutionPolicy) {
        if (hermesConversationStateStore == null || hermesMcpSessionTokenService == null) {
            return new PreparedChatHermesSession("", "", "");
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
                "",
                toolExecutionPolicy
        );
        hermesConversationStateStore.save(state);
        return new PreparedChatHermesSession(sessionToken, scopeKey, clientConversationId);
    }

    private PreparedChatHermesSession prepareMcpSessionForAgentTask(ChatRoomEntity room,
                                                                    UserEntity authorizedByUser,
                                                                    Long assistantMessageId,
                                                                    String taskInstruction,
                                                                    HermesToolExecutionPolicy toolExecutionPolicy) {
        return prepareMcpSessionForAgentTask(room, authorizedByUser, assistantMessageId, taskInstruction, toolExecutionPolicy, HermesGroundingState.empty());
    }

    PreparedChatHermesSession prepareMcpSessionForAgentTask(ChatRoomEntity room,
                                                            UserEntity authorizedByUser,
                                                            Long assistantMessageId,
                                                            String taskInstruction,
                                                            HermesToolExecutionPolicy toolExecutionPolicy,
                                                            HermesGroundingState groundingState) {
        if (hermesConversationStateStore == null || hermesMcpSessionTokenService == null) {
            return new PreparedChatHermesSession("", "", "");
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
                groundingState == null ? HermesGroundingState.empty() : groundingState,
                List.of(),
                "",
                toolExecutionPolicy
        );
        hermesConversationStateStore.save(state);
        return new PreparedChatHermesSession(sessionToken, scopeKey, clientConversationId);
    }

    /**
     * 聊天室候选选择不会经过标准 Hermes 会话接口，这里用原候选卡片把用户选择恢复成 grounding。
     * 业务意图：后续任务必须知道“已确认的是迭代/项目/工作项”，写工具才能直接产出动作卡片。
     */
    HermesGroundingState buildGroundingStateFromSelection(List<HermesSelectionCard> selectionCards,
                                                          HermesSelectionRequest selection) {
        if (selection == null) {
            return HermesGroundingState.empty();
        }
        HermesSelectionOption option = findSelectionOption(selectionCards, selection);
        Long projectId = resolveProjectIdFromRoute(option == null ? "" : option.route());
        Map<String, Object> payload = new LinkedHashMap<>();
        if (option != null) {
            payload.put("matchScore", option.matchScore());
            payload.put("matchReasons", option.matchReasons() == null ? List.of() : option.matchReasons());
        }
        if (projectId != null) {
            payload.put("projectId", projectId);
        }
        String slot = defaultString(selection.slot());
        HermesGroundingTarget target = new HermesGroundingTarget(
                slot,
                defaultString(selection.entityType()),
                selection.entityId(),
                option == null ? defaultString(selection.entityType()) + " #" + selection.entityId() : defaultString(option.title()),
                option == null ? "" : defaultString(option.route()),
                projectId,
                "SELECTION",
                Map.copyOf(payload)
        );
        return HermesGroundingState.empty()
                .withBoundSlot(slot, target)
                .withRecentResolvedSlot(slot, target)
                .clearPendingSelection();
    }

    private HermesSelectionOption findSelectionOption(List<HermesSelectionCard> selectionCards,
                                                      HermesSelectionRequest selection) {
        if (selectionCards == null || selectionCards.isEmpty() || selection == null) {
            return null;
        }
        for (HermesSelectionCard card : selectionCards) {
            if (!defaultString(card.slot()).equals(defaultString(selection.slot()))) {
                continue;
            }
            for (HermesSelectionOption option : card.options() == null ? List.<HermesSelectionOption>of() : card.options()) {
                if (selection.entityId().equals(option.entityId())
                        && defaultString(selection.entityType()).equalsIgnoreCase(defaultString(option.entityType()))) {
                    return option;
                }
            }
        }
        return null;
    }

    private Long resolveProjectIdFromRoute(String route) {
        if (!hasText(route)) {
            return null;
        }
        java.util.regex.Matcher matcher = java.util.regex.Pattern.compile("/projects/(\\d+)").matcher(route);
        if (!matcher.find()) {
            return null;
        }
        try {
            return Long.parseLong(matcher.group(1));
        } catch (NumberFormatException exception) {
            return null;
        }
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
                查询“多少、总数、统计、分布”时，数量必须使用 `metadata.totalCount`，状态分布使用 `metadata.statusCounts`；
                `candidates` 只是用于展示的候选列表，`metadata.truncated=true` 时绝不能把候选条数当成总数。
                聊天室默认只绑定项目，不自动代表某个迭代。用户未明确迭代时按项目范围回答并说明范围；
                用户明确询问“当前迭代”但上下文没有 iterationId 时，先查询项目迭代，存在多个合理候选时等待用户选择，禁止自行把项目数据说成迭代数据。
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
        List<String> guideCompleted = parseGuideCompleted(user.getGuideCompleted());
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
                permissionCodes,
                guideCompleted
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

    /**
     * 从 Hermes Redis 热状态读取 MCP tool calling 最终展示态。
     * 业务意图：模型调用工具时，内部 MCP bridge 会把动作卡片、候选卡片和执行轨迹写回同一会话态，聊天室任务在这里统一收口。
     */
    private HermesChatRoomAgentTaskResult toAgentTaskResult(PreparedChatHermesSession preparedSession, String content) {
        if (hermesConversationStateStore == null
                || preparedSession == null
                || defaultString(preparedSession.scopeKey()).isBlank()
                || defaultString(preparedSession.clientConversationId()).isBlank()) {
            return HermesChatRoomAgentTaskResult.empty(content);
        }
        return hermesConversationStateStore.load(preparedSession.scopeKey(), preparedSession.clientConversationId())
                .map(state -> {
                    List<HermesActionSummary> actions = resolveAgentTaskActions(state, content);
                    return new HermesChatRoomAgentTaskResult(
                            content,
                            actions,
                            state.selectionCards(),
                            state.toolExecutions()
                    );
                })
                .orElseGet(() -> HermesChatRoomAgentTaskResult.empty(content));
    }

    /**
     * 聊天室 Agent 的模型回复有时会先通过只读工具定位迭代，再用自然语言询问“是否创建”。
     * 业务上这已经进入写入确认阶段，这里把已定位的项目和迭代补成标准动作卡片，前端才能展示确认执行入口。
     */
    private List<HermesActionSummary> resolveAgentTaskActions(HermesConversationState state, String content) {
        if (state == null || !state.actions().isEmpty() || !isCreateRequirementConfirmation(state, content)) {
            return state == null ? List.of() : state.actions();
        }
        HermesGroundingState groundingState = state.groundingState();
        Long projectId = resolveGroundedProjectId(state, groundingState);
        Long iterationId = firstNonNull(
                resolveGroundedEntityId(groundingState, "iteration"),
                extractIterationIdFromContent(content)
        );
        if (projectId == null || iterationId == null) {
            return state.actions();
        }

        String sourceText = defaultString(content);
        String requestQuestion = state.currentRequest() == null ? "" : defaultString(state.currentRequest().question());
        String title = firstNonBlank(extractByPatterns(sourceText, QUOTED_TITLE_PATTERN, PLAIN_TITLE_PATTERN),
                extractByPatterns(requestQuestion, QUOTED_TITLE_PATTERN, PLAIN_TITLE_PATTERN),
                "Hermes 创建的需求草稿");
        String draftContent = firstNonBlank(extractByPatterns(sourceText, QUOTED_CONTENT_PATTERN, PLAIN_CONTENT_PATTERN),
                extractByPatterns(requestQuestion, QUOTED_CONTENT_PATTERN, PLAIN_CONTENT_PATTERN),
                requestQuestion.isBlank() ? "" : "根据用户请求自动整理的需求草稿：\n" + requestQuestion);

        Map<String, Object> params = new LinkedHashMap<>();
        params.put("projectId", projectId);
        params.put("iterationId", iterationId);
        params.put("workItemType", "需求");
        params.put("name", title);
        params.put("content", draftContent);
        return List.of(new HermesActionSummary(
                "CREATE_WORK_ITEM_DRAFT",
                "创建需求草稿",
                "确认后会在当前项目下创建一个“需求”草稿。",
                true,
                params
        ));
    }

    private boolean isCreateRequirementConfirmation(HermesConversationState state, String content) {
        String requestQuestion = state == null || state.currentRequest() == null ? "" : state.currentRequest().question();
        String combined = defaultString(requestQuestion) + "\n" + defaultString(content);
        return (combined.contains("创建需求草稿")
                || combined.contains("创建需求")
                || combined.contains("新增需求")
                || combined.contains("加一个需求")
                || combined.contains("需求标题")
                || (combined.contains("创建") && combined.contains("需求") && combined.contains("确认")));
    }

    private Long resolveGroundedProjectId(HermesConversationState state, HermesGroundingState groundingState) {
        Long projectId = resolveGroundedEntityId(groundingState, "project");
        if (projectId != null) {
            return projectId;
        }
        if (state != null && state.currentRequest() != null && state.currentRequest().projectId() != null) {
            return state.currentRequest().projectId();
        }
        if (state != null && state.context() != null) {
            return state.context().projectId();
        }
        HermesGroundingTarget iterationTarget = groundingState == null ? null : groundingState.boundSlot("iteration");
        return iterationTarget == null ? null : iterationTarget.projectId();
    }

    private Long resolveGroundedEntityId(HermesGroundingState groundingState, String slot) {
        HermesGroundingTarget target = groundingState == null ? null : groundingState.boundSlot(slot);
        return target == null ? null : target.entityId();
    }

    private Long extractIterationIdFromContent(String content) {
        String normalized = defaultString(content);
        if (normalized.isBlank()) {
            return null;
        }
        Long id = extractLongByPattern(normalized, ITERATION_ID_IN_TEXT_PATTERN);
        return id == null ? extractLongByPattern(normalized, ITERATION_ID_FIELD_PATTERN) : id;
    }

    private Long extractLongByPattern(String text, Pattern pattern) {
        Matcher matcher = pattern.matcher(text);
        if (!matcher.find()) {
            return null;
        }
        try {
            return Long.parseLong(matcher.group(1));
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private String extractByPatterns(String text, Pattern... patterns) {
        String normalized = defaultString(text);
        if (normalized.isBlank()) {
            return "";
        }
        for (Pattern pattern : patterns) {
            Matcher matcher = pattern.matcher(normalized);
            if (matcher.find()) {
                return defaultString(matcher.group(1));
            }
        }
        return "";
    }

    private String firstNonBlank(String... values) {
        if (values == null) {
            return "";
        }
        for (String value : values) {
            String normalized = defaultString(value);
            if (!normalized.isBlank()) {
                return normalized;
            }
        }
        return "";
    }

    private Long firstNonNull(Long... values) {
        if (values == null) {
            return null;
        }
        for (Long value : values) {
            if (value != null) {
                return value;
            }
        }
        return null;
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

    private List<String> parseGuideCompleted(String raw) {
        if (raw == null || raw.isBlank()) {
            return List.of();
        }
        return java.util.Arrays.stream(raw.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toList();
    }

    record PreparedChatHermesSession(String sessionToken, String scopeKey, String clientConversationId) {
    }
}
