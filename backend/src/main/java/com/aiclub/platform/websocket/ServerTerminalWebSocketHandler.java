package com.aiclub.platform.websocket;

import com.aiclub.platform.service.ServerTerminalSessionManager;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

/**
 * 服务器终端 WebSocket 处理器。
 */
@Component
public class ServerTerminalWebSocketHandler extends TextWebSocketHandler {

    private final ServerTerminalSessionManager serverTerminalSessionManager;
    private final ObjectMapper objectMapper;

    public ServerTerminalWebSocketHandler(ServerTerminalSessionManager serverTerminalSessionManager,
                                          ObjectMapper objectMapper) {
        this.serverTerminalSessionManager = serverTerminalSessionManager;
        this.objectMapper = objectMapper;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        String sessionId = String.valueOf(session.getAttributes().get(ServerTerminalAuthHandshakeInterceptor.SESSION_ID_ATTR));
        Long userId = (Long) session.getAttributes().get(ServerTerminalAuthHandshakeInterceptor.USER_ID_ATTR);
        serverTerminalSessionManager.attachWebSocket(sessionId, userId, session);
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        String sessionId = String.valueOf(session.getAttributes().get(ServerTerminalAuthHandshakeInterceptor.SESSION_ID_ATTR));
        JsonNode payload = objectMapper.readTree(message.getPayload());
        String type = payload.path("type").asText("");
        if ("INPUT".equalsIgnoreCase(type)) {
            serverTerminalSessionManager.handleInput(sessionId, payload.path("data").asText(""));
            return;
        }
        if ("RESIZE".equalsIgnoreCase(type)) {
            serverTerminalSessionManager.resize(
                    sessionId,
                    Math.max(40, payload.path("cols").asInt(120)),
                    Math.max(10, payload.path("rows").asInt(36))
            );
        }
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) throws Exception {
        String sessionId = String.valueOf(session.getAttributes().get(ServerTerminalAuthHandshakeInterceptor.SESSION_ID_ATTR));
        serverTerminalSessionManager.failSession(sessionId, exception.getMessage());
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        String sessionId = String.valueOf(session.getAttributes().get(ServerTerminalAuthHandshakeInterceptor.SESSION_ID_ATTR));
        serverTerminalSessionManager.handleSocketClosed(sessionId, status.getReason());
    }
}
