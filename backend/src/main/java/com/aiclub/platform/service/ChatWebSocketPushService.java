package com.aiclub.platform.service;

import com.aiclub.platform.dto.ChatMessageSummary;
import com.aiclub.platform.dto.ChatRoomAgentConfigSummary;
import com.aiclub.platform.dto.ChatRoomAgentTaskEventSummary;
import com.aiclub.platform.dto.ChatRoomAgentTaskSummary;
import com.aiclub.platform.dto.ChatRoomAgentToolPolicySummary;
import com.aiclub.platform.dto.ChatRoomSummary;
import com.aiclub.platform.dto.HermesActionSummary;
import com.aiclub.platform.dto.HermesSelectionCard;
import com.aiclub.platform.security.AuthContext;
import com.aiclub.platform.security.AuthContextHolder;
import com.aiclub.platform.websocket.ChatAuthHandshakeInterceptor;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 聊天室 WebSocket 推送服务。
 * 业务意图：REST 负责写入，WebSocket 只负责把已确认的房间事件推送给当前仍有权限的在线成员。
 */
@Service
public class ChatWebSocketPushService {

    private final ObjectMapper objectMapper;
    private final ObjectProvider<ChatRoomService> chatRoomServiceProvider;
    private final Map<Long, Set<WebSocketSession>> roomSessions = new ConcurrentHashMap<>();
    private final Map<String, Long> sessionRoomIds = new ConcurrentHashMap<>();

    public ChatWebSocketPushService(ObjectMapper objectMapper,
                                    ObjectProvider<ChatRoomService> chatRoomServiceProvider) {
        this.objectMapper = objectMapper;
        this.chatRoomServiceProvider = chatRoomServiceProvider;
    }

    /**
     * 兼容单元测试构造：Mockito mock 无需 ObjectMapper。
     */
    public ChatWebSocketPushService() {
        this(new ObjectMapper(), null);
    }

    public void joinRoom(Long roomId, WebSocketSession session) {
        if (roomId == null || session == null) {
            return;
        }
        leaveCurrentRoom(session);
        roomSessions.computeIfAbsent(roomId, ignored -> ConcurrentHashMap.newKeySet()).add(session);
        sessionRoomIds.put(session.getId(), roomId);
    }

    public void leaveCurrentRoom(WebSocketSession session) {
        if (session == null) {
            return;
        }
        Long roomId = sessionRoomIds.remove(session.getId());
        if (roomId == null) {
            return;
        }
        Set<WebSocketSession> sessions = roomSessions.get(roomId);
        if (sessions != null) {
            sessions.remove(session);
            if (sessions.isEmpty()) {
                roomSessions.remove(roomId);
            }
        }
    }

    public void broadcastMessageCreated(Long roomId, ChatMessageSummary message) {
        broadcast(roomId, Map.of("type", "ROOM_MESSAGE_CREATED", "message", message));
    }

    public void broadcastHermesDelta(Long roomId, Long messageId, String delta) {
        broadcast(roomId, Map.of("type", "HERMES_STREAM_DELTA", "messageId", messageId, "delta", delta == null ? "" : delta));
    }

    public void broadcastHermesMessageDone(Long roomId, ChatMessageSummary message) {
        broadcast(roomId, Map.of("type", "HERMES_MESSAGE_DONE", "message", message));
    }

    public void broadcastHermesMessageError(Long roomId, ChatMessageSummary message) {
        broadcast(roomId, Map.of("type", "HERMES_MESSAGE_ERROR", "message", message));
    }

    public void broadcastRoomUpdated(Long roomId, ChatRoomSummary room) {
        broadcast(roomId, Map.of("type", "ROOM_UPDATED", "room", room));
    }

    public void broadcastAgentConfigUpdated(Long roomId, ChatRoomAgentConfigSummary config) {
        broadcast(roomId, Map.of("type", "AGENT_CONFIG_UPDATED", "config", config));
    }

    public void broadcastAgentToolsUpdated(Long roomId, List<ChatRoomAgentToolPolicySummary> tools) {
        broadcast(roomId, Map.of("type", "AGENT_TOOLS_UPDATED", "tools", tools == null ? List.of() : tools));
    }

    public void broadcastAgentTaskCreated(Long roomId, ChatRoomAgentTaskSummary task) {
        broadcast(roomId, Map.of("type", "AGENT_TASK_CREATED", "task", task));
    }

    public void broadcastAgentTaskUpdated(Long roomId, ChatRoomAgentTaskSummary task) {
        broadcast(roomId, Map.of("type", "AGENT_TASK_UPDATED", "task", task));
    }

    public void broadcastAgentTaskEvent(Long roomId, ChatRoomAgentTaskEventSummary event) {
        broadcast(roomId, Map.of("type", "AGENT_TASK_EVENT", "event", event));
    }

    public void broadcastAgentActionPending(Long roomId, Long taskId, Long messageId, List<HermesActionSummary> actions) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("type", "AGENT_ACTION_PENDING");
        payload.put("taskId", taskId);
        payload.put("messageId", messageId);
        payload.put("actions", actions == null ? List.of() : actions);
        broadcast(roomId, payload);
    }

    public void broadcastAgentActionExecuted(Long roomId, Long taskId, Long messageId, HermesActionSummary action, String status) {
        broadcastAgentActionExecuted(roomId, taskId, messageId, action, status, "");
    }

    public void broadcastAgentActionExecuted(Long roomId, Long taskId, Long messageId, HermesActionSummary action, String status, String actionKey) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("type", "AGENT_ACTION_EXECUTED");
        payload.put("taskId", taskId);
        payload.put("messageId", messageId);
        payload.put("action", action);
        payload.put("status", status == null ? "" : status);
        payload.put("actionKey", actionKey == null ? "" : actionKey);
        broadcast(roomId, payload);
    }

    public void broadcastAgentSelectionPending(Long roomId, Long taskId, Long messageId, List<HermesSelectionCard> selectionCards) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("type", "AGENT_SELECTION_PENDING");
        payload.put("taskId", taskId);
        payload.put("messageId", messageId);
        payload.put("selectionCards", selectionCards == null ? List.of() : selectionCards);
        broadcast(roomId, payload);
    }

    public void broadcastAgentSelectionResolved(Long roomId, Long taskId, Long messageId, String selectionKey, String status) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("type", "AGENT_SELECTION_RESOLVED");
        payload.put("taskId", taskId);
        payload.put("messageId", messageId);
        payload.put("selectionKey", selectionKey == null ? "" : selectionKey);
        payload.put("status", status == null ? "" : status);
        broadcast(roomId, payload);
    }

    private void broadcast(Long roomId, Object payload) {
        Set<WebSocketSession> sessions = roomSessions.get(roomId);
        if (sessions == null || sessions.isEmpty()) {
            return;
        }
        try {
            String json = objectMapper.writeValueAsString(payload);
            for (WebSocketSession session : sessions) {
                if (!canStillReceive(roomId, session)) {
                    leaveCurrentRoom(session);
                    continue;
                }
                send(session, json);
            }
        } catch (IOException exception) {
            throw new IllegalStateException("聊天室消息序列化失败", exception);
        }
    }

    /**
     * 广播前二次校验房间权限。
     * 业务意图：成员被移除、项目权限变化或房间归档后，旧 WebSocket 订阅不能继续收到新消息。
     */
    private boolean canStillReceive(Long roomId, WebSocketSession session) {
        if (chatRoomServiceProvider == null || session == null) {
            return true;
        }
        ChatRoomService chatRoomService = chatRoomServiceProvider.getIfAvailable();
        if (chatRoomService == null) {
            return true;
        }
        Object authContextAttr = session.getAttributes().get(ChatAuthHandshakeInterceptor.AUTH_CONTEXT_ATTR);
        if (!(authContextAttr instanceof AuthContext authContext)) {
            return false;
        }
        try {
            AuthContextHolder.set(authContext);
            return chatRoomService.canAccessRoom(roomId, authContext.userId());
        } catch (RuntimeException exception) {
            return false;
        } finally {
            AuthContextHolder.clear();
        }
    }

    private void send(WebSocketSession session, String json) {
        if (session == null || !session.isOpen()) {
            leaveCurrentRoom(session);
            return;
        }
        try {
            session.sendMessage(new TextMessage(json));
        } catch (IOException exception) {
            leaveCurrentRoom(session);
        }
    }
}
