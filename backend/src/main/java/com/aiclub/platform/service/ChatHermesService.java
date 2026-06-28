package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ChatMessageEntity;
import com.aiclub.platform.domain.model.ChatRoomEntity;
import com.aiclub.platform.dto.ChatMessageSummary;
import com.aiclub.platform.dto.HermesConversationTurn;
import com.aiclub.platform.repository.ChatMessageRepository;
import com.aiclub.platform.repository.ChatRoomRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
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
    private final Set<Long> runningRoomIds = ConcurrentHashMap.newKeySet();

    @Autowired
    public ChatHermesService(ChatRoomRepository chatRoomRepository,
                             ChatMessageRepository chatMessageRepository,
                             HermesGatewayService hermesGatewayService,
                             ChatWebSocketPushService chatWebSocketPushService,
                             ChatAttachmentService chatAttachmentService) {
        this.chatRoomRepository = chatRoomRepository;
        this.chatMessageRepository = chatMessageRepository;
        this.hermesGatewayService = hermesGatewayService;
        this.chatWebSocketPushService = chatWebSocketPushService;
        this.chatAttachmentService = chatAttachmentService;
    }

    /**
     * 兼容单元测试构造方式。
     */
    public ChatHermesService(ChatRoomRepository chatRoomRepository,
                             ChatMessageRepository chatMessageRepository,
                             HermesGatewayService hermesGatewayService,
                             ChatWebSocketPushService chatWebSocketPushService) {
        this(chatRoomRepository, chatMessageRepository, hermesGatewayService, chatWebSocketPushService, null);
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

            List<HermesConversationTurn> transcript = buildTranscript(room, triggerMessage);
            StringBuilder streamedContent = new StringBuilder();
            HermesGatewayService.HermesGatewayResult result = hermesGatewayService.streamChatCompletion(
                    buildPrompt(room),
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

    private HermesPromptBuilder.HermesPrompt buildPrompt(ChatRoomEntity room) {
        String systemPrompt = """
                你是 AI Club 聊天室中的 Hermes 助手。
                你需要像团队成员一样基于房间历史、项目上下文和附件摘录进行回复。
                输出必须简洁、可执行；如果是在总结或汇总，请保留关键结论、风险和下一步。
                """;
        String userPrompt = "当前聊天室：" + defaultString(room.getTitle());
        return new HermesPromptBuilder.HermesPrompt(systemPrompt.trim(), userPrompt);
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
}
