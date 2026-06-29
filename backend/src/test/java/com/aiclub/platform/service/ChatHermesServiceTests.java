package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ChatMessageEntity;
import com.aiclub.platform.domain.model.ChatRoomEntity;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.HermesConversationState;
import com.aiclub.platform.dto.HermesConversationTurn;
import com.aiclub.platform.repository.ChatMessageRepository;
import com.aiclub.platform.repository.ChatRoomRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 验证聊天室 @Hermes 上下文组装和流式写回。
 */
@ExtendWith(MockitoExtension.class)
class ChatHermesServiceTests {

    @Mock
    private ChatRoomRepository chatRoomRepository;

    @Mock
    private ChatMessageRepository chatMessageRepository;

    @Mock
    private HermesGatewayService hermesGatewayService;

    @Mock
    private ChatWebSocketPushService chatWebSocketPushService;

    @Mock
    private HermesConversationStateStore hermesConversationStateStore;

    @Mock
    private HermesMcpSessionTokenService hermesMcpSessionTokenService;

    @Test
    void shouldStreamHermesReplyWithRoomSummaryAndRecentMessages() {
        ChatRoomEntity room = room();
        ChatMessageEntity assistant = message(102L, room, null, "assistant", "", "STREAMING");
        ChatMessageEntity userMessage = message(101L, room, user(5L, "pm", "产品"), "user", "@hermes 汇总一下", "DONE");
        ChatMessageEntity previous = message(100L, room, user(6L, "dev", "开发"), "user", "后端接口已经联调完成", "DONE");
        ChatHermesService service = new ChatHermesService(
                chatRoomRepository,
                chatMessageRepository,
                hermesGatewayService,
                chatWebSocketPushService,
                null,
                hermesConversationStateStore,
                hermesMcpSessionTokenService
        );

        when(chatRoomRepository.findById(41L)).thenReturn(Optional.of(room));
        when(chatMessageRepository.findById(102L)).thenReturn(Optional.of(assistant));
        when(chatMessageRepository.findById(101L)).thenReturn(Optional.of(userMessage));
        when(chatMessageRepository.findTop80ByRoom_IdOrderByCreatedAtDescIdDesc(41L)).thenReturn(List.of(userMessage, previous));
        when(hermesMcpSessionTokenService.issueToken(any(), eq("chat-room:41:user:5:message:101"), eq("chat-room-41-message-101")))
                .thenReturn("hcs_chat_token_1234");
        when(hermesConversationStateStore.save(any(HermesConversationState.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(hermesGatewayService.streamChatCompletion(any(), any(), any())).thenAnswer(invocation -> {
            HermesGatewayService.HermesDeltaConsumer consumer = invocation.getArgument(2);
            consumer.onDelta("当前结论：");
            consumer.onDelta("可以发布。");
            return new HermesGatewayService.HermesGatewayResult("resp-1", "当前结论：可以发布。");
        });
        when(chatMessageRepository.save(any(ChatMessageEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(chatRoomRepository.save(any(ChatRoomEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        service.startHermesReply(41L, 102L, 101L);

        ArgumentCaptor<List<HermesConversationTurn>> transcriptCaptor = ArgumentCaptor.forClass(List.class);
        verify(hermesGatewayService).streamChatCompletion(any(), transcriptCaptor.capture(), any());
        String joinedTranscript = transcriptCaptor.getValue().stream().map(HermesConversationTurn::content).reduce("", (a, b) -> a + "\n" + b);
        assertThat(joinedTranscript)
                .contains("历史摘要：昨天确认了上线范围")
                .contains("开发：后端接口已经联调完成")
                .contains("产品：@hermes 汇总一下");
        verify(chatWebSocketPushService).broadcastHermesDelta(41L, 102L, "当前结论：");
        verify(chatWebSocketPushService).broadcastHermesMessageDone(eq(41L), any());
        assertThat(assistant.getContent()).isEqualTo("当前结论：可以发布。");
        assertThat(assistant.getStatus()).isEqualTo("DONE");
        assertThat(room.getHistorySummary()).contains("当前结论：可以发布");
    }

    @Test
    void shouldInjectMcpSessionTokenAndSaveStateBeforeGatewayCall() {
        ChatRoomEntity room = room();
        ChatMessageEntity assistant = message(102L, room, null, "assistant", "", "STREAMING");
        ChatMessageEntity userMessage = message(101L, room, user(5L, "pm", "产品"), "user", "@hermes 查 CRM项目 #4最近的需求工作项", "DONE");
        ChatHermesService service = new ChatHermesService(
                chatRoomRepository,
                chatMessageRepository,
                hermesGatewayService,
                chatWebSocketPushService,
                null,
                hermesConversationStateStore,
                hermesMcpSessionTokenService
        );

        when(chatRoomRepository.findById(41L)).thenReturn(Optional.of(room));
        when(chatMessageRepository.findById(102L)).thenReturn(Optional.of(assistant));
        when(chatMessageRepository.findById(101L)).thenReturn(Optional.of(userMessage));
        when(chatMessageRepository.findTop80ByRoom_IdOrderByCreatedAtDescIdDesc(41L)).thenReturn(List.of(userMessage));
        when(hermesMcpSessionTokenService.issueToken(any(), eq("chat-room:41:user:5:message:101"), eq("chat-room-41-message-101")))
                .thenReturn("hcs_chat_token_1234");
        when(hermesConversationStateStore.save(any(HermesConversationState.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(hermesGatewayService.streamChatCompletion(any(), any(), any()))
                .thenReturn(new HermesGatewayService.HermesGatewayResult("resp-1", "已查到最近需求。"));
        when(chatMessageRepository.save(any(ChatMessageEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(chatRoomRepository.save(any(ChatRoomEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        service.startHermesReply(41L, 102L, 101L);

        ArgumentCaptor<HermesPromptBuilder.HermesPrompt> promptCaptor = ArgumentCaptor.forClass(HermesPromptBuilder.HermesPrompt.class);
        ArgumentCaptor<HermesConversationState> stateCaptor = ArgumentCaptor.forClass(HermesConversationState.class);
        verify(hermesGatewayService).streamChatCompletion(promptCaptor.capture(), any(), any());
        verify(hermesConversationStateStore).save(stateCaptor.capture());
        InOrder inOrder = inOrder(hermesConversationStateStore, hermesGatewayService);
        inOrder.verify(hermesConversationStateStore).save(any(HermesConversationState.class));
        inOrder.verify(hermesGatewayService).streamChatCompletion(any(), any(), any());
        assertThat(promptCaptor.getValue().systemPrompt())
                .contains("当前轮唯一有效的 `system_session_token` 是：`hcs_chat_token_1234`")
                .contains("每次调用平台 MCP 工具必须原样传入 `system_session_token`");
        assertThat(stateCaptor.getValue().scopeKey()).isEqualTo("chat-room:41:user:5:message:101");
        assertThat(stateCaptor.getValue().clientConversationId()).isEqualTo("chat-room-41-message-101");
        assertThat(stateCaptor.getValue().mcpSessionToken()).isEqualTo("hcs_chat_token_1234");
        assertThat(stateCaptor.getValue().currentRequest().routeName()).isEqualTo("chat-room");
        assertThat(stateCaptor.getValue().currentRequest().projectId()).isEqualTo(12L);
        assertThat(stateCaptor.getValue().currentUser().id()).isEqualTo(5L);
    }

    private ChatRoomEntity room() {
        ChatRoomEntity room = new ChatRoomEntity();
        room.setId(41L);
        room.setTitle("发布讨论");
        room.setVisibilityType("PROJECT");
        room.setHistorySummary("昨天确认了上线范围");
        ProjectEntity project = new ProjectEntity();
        project.setId(12L);
        project.setName("支付项目");
        project.setOwner("owner");
        project.setStatus("进行中");
        project.setDescription("");
        room.setProject(project);
        room.setCreatorUser(user(5L, "pm", "产品"));
        return room;
    }

    private ChatMessageEntity message(Long id, ChatRoomEntity room, UserEntity sender, String role, String content, String status) {
        ChatMessageEntity message = new ChatMessageEntity();
        message.setId(id);
        message.setRoom(room);
        message.setSenderUser(sender);
        message.setRole(role);
        message.setContent(content);
        message.setStatus(status);
        if (sender != null) {
            message.setSenderNameSnapshot(sender.getNickname());
            message.setSenderUsernameSnapshot(sender.getUsername());
        }
        return message;
    }

    private UserEntity user(Long id, String username, String nickname) {
        UserEntity entity = new UserEntity();
        entity.setId(id);
        entity.setUsername(username);
        entity.setNickname(nickname);
        entity.setPasswordHash("hash");
        entity.setEnabled(true);
        return entity;
    }
}
