package com.aiclub.platform.websocket;

import com.aiclub.platform.security.AuthContext;
import com.aiclub.platform.security.AuthContextHolder;
import com.aiclub.platform.service.ChatRoomService;
import com.aiclub.platform.service.ChatWebSocketPushService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.util.Map;

/**
 * 聊天室 WebSocket 处理器。
 * 业务意图：客户端只通过 WebSocket 订阅房间事件，真实写入仍走 REST，避免一套写逻辑两边分叉。
 */
@Component
public class ChatWebSocketHandler extends TextWebSocketHandler {

    private final ChatRoomService chatRoomService;
    private final ChatWebSocketPushService chatWebSocketPushService;
    private final ObjectMapper objectMapper;

    public ChatWebSocketHandler(ChatRoomService chatRoomService,
                                ChatWebSocketPushService chatWebSocketPushService,
                                ObjectMapper objectMapper) {
        this.chatRoomService = chatRoomService;
        this.chatWebSocketPushService = chatWebSocketPushService;
        this.objectMapper = objectMapper;
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        AuthContext authContext = (AuthContext) session.getAttributes().get(ChatAuthHandshakeInterceptor.AUTH_CONTEXT_ATTR);
        if (authContext == null) {
            session.close(CloseStatus.NOT_ACCEPTABLE.withReason("unauthorized"));
            return;
        }
        try {
            AuthContextHolder.set(authContext);
            JsonNode payload = objectMapper.readTree(message.getPayload());
            String type = payload.path("type").asText("");
            if ("JOIN_ROOM".equals(type)) {
                Long roomId = payload.path("roomId").isNumber() ? payload.path("roomId").asLong() : null;
                chatRoomService.requireAccessibleRoom(roomId, authContext.userId());
                chatWebSocketPushService.joinRoom(roomId, session);
                send(session, Map.of("type", "ROOM_JOINED", "roomId", roomId));
            } else if ("LEAVE_ROOM".equals(type)) {
                chatWebSocketPushService.leaveCurrentRoom(session);
                send(session, Map.of("type", "ROOM_LEFT"));
            } else if ("PING".equals(type)) {
                send(session, Map.of("type", "PONG"));
            }
        } finally {
            AuthContextHolder.clear();
        }
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        chatWebSocketPushService.leaveCurrentRoom(session);
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        chatWebSocketPushService.leaveCurrentRoom(session);
    }

    private void send(WebSocketSession session, Object payload) throws Exception {
        if (session != null && session.isOpen()) {
            session.sendMessage(new TextMessage(objectMapper.writeValueAsString(payload)));
        }
    }
}
