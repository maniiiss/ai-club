package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ChatMessageEntity;
import com.aiclub.platform.domain.model.ChatRoomEntity;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.AssistantChatRoomAgentTaskResult;
import com.aiclub.platform.dto.AssistantConversationState;
import com.aiclub.platform.dto.AssistantConversationTurn;
import com.aiclub.platform.dto.AssistantGroundingState;
import com.aiclub.platform.dto.AssistantGroundingTarget;
import com.aiclub.platform.dto.AssistantToolExecutionPolicy;
import com.aiclub.platform.repository.ChatMessageRepository;
import com.aiclub.platform.repository.ChatRoomRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 验证聊天室 @Assistant 上下文组装和流式写回。
 */
@ExtendWith(MockitoExtension.class)
class ChatAssistantServiceTests {

    @Mock
    private ChatRoomRepository chatRoomRepository;

    @Mock
    private ChatMessageRepository chatMessageRepository;

    @Mock
    private AssistantGatewayService assistantGatewayService;

    @Mock
    private ChatWebSocketPushService chatWebSocketPushService;

    @Mock
    private AssistantConversationStateStore assistantConversationStateStore;

    @Mock
    private AssistantMcpSessionTokenService assistantMcpSessionTokenService;

    @Test
    void shouldStreamAssistantReplyWithRoomSummaryAndRecentMessages() {
        ChatRoomEntity room = room();
        ChatMessageEntity assistant = message(102L, room, null, "assistant", "", "STREAMING");
        ChatMessageEntity userMessage = message(101L, room, user(5L, "pm", "产品"), "user", "@hermes 汇总一下", "DONE");
        ChatMessageEntity previous = message(100L, room, user(6L, "dev", "开发"), "user", "后端接口已经联调完成", "DONE");
        ChatAssistantService service = new ChatAssistantService(
                chatRoomRepository,
                chatMessageRepository,
                assistantGatewayService,
                chatWebSocketPushService,
                null,
                assistantConversationStateStore,
                assistantMcpSessionTokenService
        );

        when(chatRoomRepository.findById(41L)).thenReturn(Optional.of(room));
        when(chatMessageRepository.findById(102L)).thenReturn(Optional.of(assistant));
        when(chatMessageRepository.findById(101L)).thenReturn(Optional.of(userMessage));
        when(chatMessageRepository.findTop80ByRoom_IdOrderByCreatedAtDescIdDesc(41L)).thenReturn(List.of(userMessage, previous));
        when(assistantMcpSessionTokenService.issueToken(any(), eq("chat-room:41:user:5:message:101"), eq("chat-room-41-message-101")))
                .thenReturn("hcs_chat_token_1234");
        when(assistantConversationStateStore.save(any(AssistantConversationState.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(assistantGatewayService.streamChatCompletion(any(), any(), any())).thenAnswer(invocation -> {
            AssistantGatewayService.AssistantDeltaConsumer consumer = invocation.getArgument(2);
            consumer.onDelta("当前结论：");
            consumer.onDelta("可以发布。");
            return new AssistantGatewayService.AssistantGatewayResult("resp-1", "当前结论：可以发布。");
        });
        when(chatMessageRepository.save(any(ChatMessageEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(chatRoomRepository.save(any(ChatRoomEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        service.startAssistantReply(41L, 102L, 101L);

        ArgumentCaptor<List<AssistantConversationTurn>> transcriptCaptor = ArgumentCaptor.forClass(List.class);
        verify(assistantGatewayService).streamChatCompletion(any(), transcriptCaptor.capture(), any());
        String joinedTranscript = transcriptCaptor.getValue().stream().map(AssistantConversationTurn::content).reduce("", (a, b) -> a + "\n" + b);
        assertThat(joinedTranscript)
                .contains("历史摘要：昨天确认了上线范围")
                .contains("开发：后端接口已经联调完成")
                .contains("产品：@hermes 汇总一下");
        verify(chatWebSocketPushService).broadcastAssistantDelta(41L, 102L, "当前结论：");
        verify(chatWebSocketPushService).broadcastAssistantMessageDone(eq(41L), any());
        assertThat(assistant.getContent()).isEqualTo("当前结论：可以发布。");
        assertThat(assistant.getStatus()).isEqualTo("DONE");
        assertThat(room.getHistorySummary()).contains("当前结论：可以发布");
    }

    @Test
    void shouldInjectMcpSessionTokenAndSaveStateBeforeGatewayCall() {
        ChatRoomEntity room = room();
        ChatMessageEntity assistant = message(102L, room, null, "assistant", "", "STREAMING");
        ChatMessageEntity userMessage = message(101L, room, user(5L, "pm", "产品"), "user", "@hermes 查示例项目 #4最近的需求工作项", "DONE");
        ChatAssistantService service = new ChatAssistantService(
                chatRoomRepository,
                chatMessageRepository,
                assistantGatewayService,
                chatWebSocketPushService,
                null,
                assistantConversationStateStore,
                assistantMcpSessionTokenService
        );

        when(chatRoomRepository.findById(41L)).thenReturn(Optional.of(room));
        when(chatMessageRepository.findById(102L)).thenReturn(Optional.of(assistant));
        when(chatMessageRepository.findById(101L)).thenReturn(Optional.of(userMessage));
        when(chatMessageRepository.findTop80ByRoom_IdOrderByCreatedAtDescIdDesc(41L)).thenReturn(List.of(userMessage));
        when(assistantMcpSessionTokenService.issueToken(any(), eq("chat-room:41:user:5:message:101"), eq("chat-room-41-message-101")))
                .thenReturn("hcs_chat_token_1234");
        when(assistantConversationStateStore.save(any(AssistantConversationState.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(assistantGatewayService.streamChatCompletion(any(), any(), any()))
                .thenReturn(new AssistantGatewayService.AssistantGatewayResult("resp-1", "已查到最近需求。"));
        when(chatMessageRepository.save(any(ChatMessageEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(chatRoomRepository.save(any(ChatRoomEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        service.startAssistantReply(41L, 102L, 101L);

        ArgumentCaptor<AssistantPromptBuilder.AssistantPrompt> promptCaptor = ArgumentCaptor.forClass(AssistantPromptBuilder.AssistantPrompt.class);
        ArgumentCaptor<AssistantConversationState> stateCaptor = ArgumentCaptor.forClass(AssistantConversationState.class);
        verify(assistantGatewayService).streamChatCompletion(promptCaptor.capture(), any(), any());
        verify(assistantConversationStateStore).save(stateCaptor.capture());
        InOrder inOrder = inOrder(assistantConversationStateStore, assistantGatewayService);
        inOrder.verify(assistantConversationStateStore).save(any(AssistantConversationState.class));
        inOrder.verify(assistantGatewayService).streamChatCompletion(any(), any(), any());
        assertThat(promptCaptor.getValue().systemPrompt())
                .contains("当前轮唯一有效的 `system_session_token` 是：`hcs_chat_token_1234`")
                .contains("每次调用平台 MCP 工具必须原样传入 `system_session_token`")
                .contains("数量必须使用 `metadata.totalCount`")
                .contains("聊天室默认只绑定项目，不自动代表某个迭代");
        assertThat(stateCaptor.getValue().scopeKey()).isEqualTo("chat-room:41:user:5:message:101");
        assertThat(stateCaptor.getValue().clientConversationId()).isEqualTo("chat-room-41-message-101");
        assertThat(stateCaptor.getValue().mcpSessionToken()).isEqualTo("hcs_chat_token_1234");
        assertThat(stateCaptor.getValue().currentRequest().routeName()).isEqualTo("chat-room");
        assertThat(stateCaptor.getValue().currentRequest().projectId()).isEqualTo(12L);
        assertThat(stateCaptor.getValue().currentUser().id()).isEqualTo(5L);
    }

    @Test
    void shouldCreateWorkItemDraftActionWhenAgentResolvedIterationTextAfterCreationRequest() {
        ChatRoomEntity room = room();
        ChatMessageEntity assistant = message(202L, room, null, "assistant", "", "STREAMING");
        ChatAssistantService service = new ChatAssistantService(
                chatRoomRepository,
                chatMessageRepository,
                assistantGatewayService,
                chatWebSocketPushService,
                null,
                assistantConversationStateStore,
                assistantMcpSessionTokenService
        );
        String content = "最新的进行中迭代是 迭代2 (ID:2)。\n"
                + "现在我来帮您创建需求草稿，放到迭代2中。"
                + "需求标题是“营销激励数据权限调整”，内容是“营销激励数据权限改为本单位及子单位”，请确认是否要这样创建?";
        AssistantGroundingState groundingState = AssistantGroundingState.empty()
                .withBoundSlot("project", new AssistantGroundingTarget(
                        "project",
                        "PROJECT",
                        12L,
                        "支付项目",
                        "/projects/12",
                        12L,
                        "ROOM",
                        Map.of()
                ));
        AssistantConversationState afterToolCall = new AssistantConversationState(
                "chat-room:41:agent-task:202:user:5",
                "chat-room-41-agent-task-202",
                null,
                null,
                null,
                "hcs_chat_token_1234",
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                groundingState,
                List.of(),
                ""
        );

        when(chatRoomRepository.findById(41L)).thenReturn(Optional.of(room));
        when(chatMessageRepository.findById(202L)).thenReturn(Optional.of(assistant));
        when(assistantMcpSessionTokenService.issueToken(any(), eq("chat-room:41:agent-task:202:user:5"), eq("chat-room-41-agent-task-202")))
                .thenReturn("hcs_chat_token_1234");
        when(assistantConversationStateStore.save(any(AssistantConversationState.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(assistantConversationStateStore.load("chat-room:41:agent-task:202:user:5", "chat-room-41-agent-task-202"))
                .thenReturn(Optional.of(afterToolCall));
        when(assistantGatewayService.streamChatCompletion(any(), any(), any()))
                .thenReturn(new AssistantGatewayService.AssistantGatewayResult("resp-2", content));
        when(chatMessageRepository.findTop80ByRoom_IdOrderByCreatedAtDescIdDesc(41L)).thenReturn(List.of());
        when(chatMessageRepository.save(any(ChatMessageEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(chatRoomRepository.save(any(ChatRoomEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        AssistantChatRoomAgentTaskResult result = service.startAgentTaskReply(
                41L,
                202L,
                "帮我创建一个需求，标题是营销激励数据权限调整，内容是营销激励数据权限改为本单位及子单位",
                user(5L, "pm", "产品"),
                AssistantToolExecutionPolicy.empty()
        );

        assertThat(result.actions()).hasSize(1);
        assertThat(result.actions().get(0).type()).isEqualTo("CREATE_WORK_ITEM_DRAFT");
        assertThat(result.actions().get(0).params())
                .containsEntry("projectId", 12L)
                .containsEntry("iterationId", 2L)
                .containsEntry("workItemType", "需求")
                .containsEntry("name", "营销激励数据权限调整")
                .containsEntry("content", "营销激励数据权限改为本单位及子单位");
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
