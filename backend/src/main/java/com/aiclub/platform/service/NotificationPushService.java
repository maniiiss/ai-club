package com.aiclub.platform.service;

import com.aiclub.platform.dto.NotificationRealtimeEvent;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class NotificationPushService {

    private static final String USER_ID_ATTR = "notificationUserId";

    private final ObjectMapper objectMapper;
    private final ConcurrentHashMap<Long, Set<WebSocketSession>> sessionMap = new ConcurrentHashMap<>();

    public NotificationPushService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public void register(WebSocketSession session) {
        Object userIdValue = session.getAttributes().get(USER_ID_ATTR);
        if (!(userIdValue instanceof Long userId)) {
            return;
        }
        sessionMap.computeIfAbsent(userId, ignored -> ConcurrentHashMap.newKeySet()).add(session);
    }

    public void unregister(WebSocketSession session) {
        Object userIdValue = session.getAttributes().get(USER_ID_ATTR);
        if (!(userIdValue instanceof Long userId)) {
            return;
        }
        Set<WebSocketSession> sessions = sessionMap.get(userId);
        if (sessions == null) {
            return;
        }
        sessions.remove(session);
        if (sessions.isEmpty()) {
            sessionMap.remove(userId);
        }
    }

    public void pushToUser(Long userId, NotificationRealtimeEvent event) {
        if (userId == null) {
            return;
        }
        Set<WebSocketSession> sessions = sessionMap.get(userId);
        if (sessions == null || sessions.isEmpty()) {
            return;
        }
        String payload;
        try {
            payload = objectMapper.writeValueAsString(event);
        } catch (IOException exception) {
            return;
        }
        TextMessage message = new TextMessage(payload);
        for (WebSocketSession session : sessions) {
            if (!session.isOpen()) {
                unregister(session);
                continue;
            }
            try {
                session.sendMessage(message);
            } catch (IOException exception) {
                unregister(session);
            }
        }
    }
}
