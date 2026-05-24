package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ServerInfoEntity;
import com.aiclub.platform.domain.model.ServerTerminalSessionLogEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.repository.ServerTerminalSessionLogRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 管理服务器终端会话的生命周期。
 */
@Service
public class ServerTerminalSessionManager implements PlatformEnvVarChangeListener {

    public static final String REASON_CLIENT_CLOSED = "CLIENT_CLOSED";
    public static final String REASON_SERVER_DELETED = "SERVER_DELETED";
    public static final String REASON_MODULE_DISABLED = "MODULE_DISABLED";

    private static final Logger log = LoggerFactory.getLogger(ServerTerminalSessionManager.class);
    private static final CloseStatus MODULE_DISABLED_CLOSE_STATUS = new CloseStatus(4403, REASON_MODULE_DISABLED);

    private final ServerTerminalSessionLogRepository serverTerminalSessionLogRepository;
    private final ServerModuleGateService serverModuleGateService;
    private final ServerSshGateway serverSshGateway;
    private final ObjectMapper objectMapper;
    private final ExecutorService readerExecutor = Executors.newCachedThreadPool();
    private final Map<String, ActiveTerminalSession> activeSessions = new ConcurrentHashMap<>();
    private final Map<String, TerminalSize> pendingSizes = new ConcurrentHashMap<>();

    public ServerTerminalSessionManager(ServerTerminalSessionLogRepository serverTerminalSessionLogRepository,
                                        ServerModuleGateService serverModuleGateService,
                                        ServerSshGateway serverSshGateway,
                                        ObjectMapper objectMapper) {
        this.serverTerminalSessionLogRepository = serverTerminalSessionLogRepository;
        this.serverModuleGateService = serverModuleGateService;
        this.serverSshGateway = serverSshGateway;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public void createPendingSession(String sessionId,
                                     ServerInfoEntity server,
                                     UserEntity user,
                                     String sourceIp,
                                     int cols,
                                     int rows) {
        ServerTerminalSessionLogEntity logEntity = new ServerTerminalSessionLogEntity();
        logEntity.setSessionId(sessionId);
        logEntity.setServer(server);
        logEntity.setUser(user);
        logEntity.setSourceIp(sourceIp);
        logEntity.setConnectionStatus("PENDING");
        logEntity.setStartedAt(LocalDateTime.now());
        serverTerminalSessionLogRepository.save(logEntity);
        pendingSizes.put(sessionId, new TerminalSize(cols, rows));
    }

    public boolean canOpenSession(String sessionId, Long userId) {
        return serverTerminalSessionLogRepository.findBySessionId(sessionId)
                .filter(item -> item.getUser().getId().equals(userId))
                .isPresent();
    }

    @Transactional
    public void attachWebSocket(String sessionId, Long userId, WebSocketSession webSocketSession) {
        serverModuleGateService.requireEnabled();
        ServerTerminalSessionLogEntity logEntity = serverTerminalSessionLogRepository.findBySessionId(sessionId)
                .orElseThrow(() -> new NoSuchElementException("终端会话不存在: " + sessionId));
        if (!logEntity.getUser().getId().equals(userId)) {
            throw new IllegalStateException("当前终端会话不属于你");
        }
        TerminalSize terminalSize = pendingSizes.getOrDefault(sessionId, new TerminalSize(120, 36));
        ServerSshGateway.ServerShellClient shellClient = serverSshGateway.openShell(logEntity.getServer(), terminalSize.cols(), terminalSize.rows());
        ActiveTerminalSession activeSession = new ActiveTerminalSession(sessionId, userId, logEntity.getServer().getId(), webSocketSession, shellClient);
        activeSessions.put(sessionId, activeSession);
        logEntity.setConnectionStatus("CONNECTED");
        logEntity.setConnectedAt(LocalDateTime.now());
        logEntity.setErrorMessage(null);
        serverTerminalSessionLogRepository.save(logEntity);
        pendingSizes.remove(sessionId);
        sendEvent(webSocketSession, Map.of("type", "STATUS", "status", "CONNECTED"));
        startStreamPump(activeSession, shellClient.stdout());
        startStreamPump(activeSession, shellClient.stderr());
    }

    public void handleInput(String sessionId, String data) {
        ActiveTerminalSession session = requireActiveSession(sessionId);
        synchronized (session) {
            try {
                session.shellClient().stdin().write(data.getBytes(StandardCharsets.UTF_8));
                session.shellClient().stdin().flush();
            } catch (IOException exception) {
                failSession(sessionId, "终端输入写入失败");
            }
        }
    }

    public void resize(String sessionId, int cols, int rows) {
        ActiveTerminalSession session = requireActiveSession(sessionId);
        session.shellClient().resize(cols, rows);
    }

    @Transactional
    public void closeOwnedSession(String sessionId, Long userId, String reason) {
        ServerTerminalSessionLogEntity logEntity = serverTerminalSessionLogRepository.findBySessionId(sessionId)
                .orElseThrow(() -> new NoSuchElementException("终端会话不存在: " + sessionId));
        if (!logEntity.getUser().getId().equals(userId)) {
            throw new IllegalStateException("当前终端会话不属于你");
        }
        closeSession(sessionId, reason, CloseStatus.NORMAL);
    }

    public void closeSessionsForServer(Long serverId, String reason) {
        activeSessions.values().stream()
                .filter(item -> item.serverId().equals(serverId))
                .map(ActiveTerminalSession::sessionId)
                .toList()
                .forEach(sessionId -> closeSession(sessionId, reason, CloseStatus.NORMAL));
    }

    public void handleSocketClosed(String sessionId, String reason) {
        closeSession(sessionId, reason == null || reason.isBlank() ? REASON_CLIENT_CLOSED : reason, CloseStatus.NORMAL);
    }

    public void failSession(String sessionId, String message) {
        closeSession(sessionId, "FAILED", CloseStatus.SERVER_ERROR, message);
    }

    private void startStreamPump(ActiveTerminalSession session, InputStream inputStream) {
        readerExecutor.submit(() -> {
            byte[] buffer = new byte[2048];
            try {
                while (session.webSocketSession().isOpen()) {
                    int read = inputStream.read(buffer);
                    if (read < 0) {
                        break;
                    }
                    if (read == 0) {
                        continue;
                    }
                    String chunk = new String(buffer, 0, read, StandardCharsets.UTF_8);
                    sendEvent(session.webSocketSession(), Map.of("type", "OUTPUT", "data", chunk));
                }
                if (activeSessions.containsKey(session.sessionId())) {
                    closeSession(session.sessionId(), REASON_CLIENT_CLOSED, CloseStatus.NORMAL);
                }
            } catch (IOException exception) {
                if (activeSessions.containsKey(session.sessionId())) {
                    closeSession(session.sessionId(), "FAILED", CloseStatus.SERVER_ERROR, exception.getMessage());
                }
            }
        });
    }

    private ActiveTerminalSession requireActiveSession(String sessionId) {
        ActiveTerminalSession session = activeSessions.get(sessionId);
        if (session == null) {
            throw new IllegalStateException("终端会话未连接");
        }
        return session;
    }

    private void closeSession(String sessionId, String reason, CloseStatus closeStatus) {
        closeSession(sessionId, reason, closeStatus, null);
    }

    @Transactional
    protected void closeSession(String sessionId, String reason, CloseStatus closeStatus, String errorMessage) {
        ActiveTerminalSession activeSession = activeSessions.remove(sessionId);
        pendingSizes.remove(sessionId);
        if (activeSession != null) {
            activeSession.shellClient().close();
            if (activeSession.webSocketSession().isOpen()) {
                try {
                    activeSession.webSocketSession().close(closeStatus);
                } catch (IOException ignored) {
                    // ignore
                }
            }
        }
        serverTerminalSessionLogRepository.findBySessionId(sessionId).ifPresent(logEntity -> {
            if (!"CLOSED".equals(logEntity.getConnectionStatus()) && !"FAILED".equals(logEntity.getConnectionStatus())) {
                logEntity.setConnectionStatus(errorMessage == null ? "CLOSED" : "FAILED");
                logEntity.setCloseReason(reason);
                logEntity.setErrorMessage(limitMessage(errorMessage));
                logEntity.setEndedAt(LocalDateTime.now());
                serverTerminalSessionLogRepository.save(logEntity);
            }
        });
    }

    private void sendEvent(WebSocketSession session, Map<String, Object> payload) {
        try {
            session.sendMessage(new TextMessage(objectMapper.writeValueAsString(payload)));
        } catch (IOException exception) {
            throw new IllegalStateException("终端消息推送失败", exception);
        }
    }

    @Override
    public void onEnvVarUpdated(String envKey) {
        if (!PlatformEnvVarRegistry.KEY_SERVER_MODULE_ENABLED.equalsIgnoreCase(envKey)) {
            return;
        }
        if (!serverModuleGateService.isEnabled()) {
            activeSessions.keySet().forEach(sessionId -> closeSession(sessionId, REASON_MODULE_DISABLED, MODULE_DISABLED_CLOSE_STATUS));
        }
    }

    private String limitMessage(String message) {
        if (message == null) {
            return null;
        }
        String normalized = message.trim();
        return normalized.length() <= 500 ? normalized : normalized.substring(0, 500);
    }

    private record TerminalSize(int cols, int rows) {
    }

    private record ActiveTerminalSession(
            String sessionId,
            Long userId,
            Long serverId,
            WebSocketSession webSocketSession,
            ServerSshGateway.ServerShellClient shellClient
    ) {
    }
}
