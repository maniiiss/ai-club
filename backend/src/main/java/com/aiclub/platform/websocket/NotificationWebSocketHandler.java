package com.aiclub.platform.websocket;

import com.aiclub.platform.service.NotificationPushService;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

@Component
public class NotificationWebSocketHandler extends TextWebSocketHandler {

    private final NotificationPushService notificationPushService;

    public NotificationWebSocketHandler(NotificationPushService notificationPushService) {
        this.notificationPushService = notificationPushService;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        notificationPushService.register(session);
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) throws Exception {
        notificationPushService.unregister(session);
        session.close(CloseStatus.SERVER_ERROR);
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        // Server push only.
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        notificationPushService.unregister(session);
    }
}
