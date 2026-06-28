package com.aiclub.platform.service;

import com.aiclub.platform.dto.ChatMessageSummary;
import com.aiclub.platform.security.AuthContext;
import com.aiclub.platform.websocket.ChatAuthHandshakeInterceptor;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 覆盖聊天室 WebSocket 广播前的实时权限复查。
 */
@ExtendWith(MockitoExtension.class)
class ChatWebSocketPushServiceTests {

    @Mock
    private ObjectProvider<ChatRoomService> chatRoomServiceProvider;

    @Mock
    private ChatRoomService chatRoomService;

    @Mock
    private WebSocketSession session;

    @Test
    void shouldSkipSessionWhenRoomPermissionWasRevokedBeforeBroadcast() throws Exception {
        ChatWebSocketPushService service = new ChatWebSocketPushService(new ObjectMapper(), chatRoomServiceProvider);
        AuthContext authContext = new AuthContext(7L, "tester", "测试", Set.of(), Set.of("chat:view"));

        when(session.getId()).thenReturn("session-1");
        when(session.getAttributes()).thenReturn(Map.of(ChatAuthHandshakeInterceptor.AUTH_CONTEXT_ATTR, authContext));
        when(chatRoomServiceProvider.getIfAvailable()).thenReturn(chatRoomService);
        when(chatRoomService.canAccessRoom(12L, 7L)).thenReturn(false);

        service.joinRoom(12L, session);
        service.broadcastMessageCreated(12L, new ChatMessageSummary(
                1L,
                12L,
                "user",
                7L,
                "tester",
                "测试",
                "",
                "hello",
                "done",
                false,
                List.of(),
                null,
                null
        ));

        verify(session, never()).sendMessage(any(TextMessage.class));
    }
}
