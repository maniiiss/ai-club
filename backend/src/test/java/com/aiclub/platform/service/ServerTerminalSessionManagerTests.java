package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ServerInfoEntity;
import com.aiclub.platform.domain.model.ServerTerminalSessionLogEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.repository.ServerTerminalSessionLogRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ServerTerminalSessionManagerTests {

    @Mock
    private ServerTerminalSessionLogRepository serverTerminalSessionLogRepository;

    @Mock
    private ServerModuleGateService serverModuleGateService;

    @Mock
    private ServerSshGateway serverSshGateway;

    @Mock
    private WebSocketSession webSocketSession;

    @Test
    void shouldCloseActiveSessionsWhenModuleDisabledEnvVarUpdated() throws IOException {
        ServerTerminalSessionManager manager = new ServerTerminalSessionManager(
                serverTerminalSessionLogRepository,
                serverModuleGateService,
                serverSshGateway,
                new ObjectMapper()
        );
        ServerTerminalSessionLogEntity logEntity = new ServerTerminalSessionLogEntity();
        logEntity.setSessionId("session-1");
        logEntity.setConnectionStatus("PENDING");
        logEntity.setStartedAt(LocalDateTime.now());
        ServerInfoEntity server = new ServerInfoEntity();
        server.setId(8L);
        logEntity.setServer(server);
        UserEntity user = new UserEntity();
        user.setId(9L);
        logEntity.setUser(user);

        BlockingShellClient shellClient = new BlockingShellClient();
        when(serverTerminalSessionLogRepository.findBySessionId("session-1")).thenReturn(Optional.of(logEntity));
        when(serverTerminalSessionLogRepository.save(any(ServerTerminalSessionLogEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(serverSshGateway.openShell(server, 120, 36)).thenReturn(shellClient);
        when(webSocketSession.isOpen()).thenReturn(true);
        doAnswer(invocation -> null).when(webSocketSession).sendMessage(any(TextMessage.class));
        manager.createPendingSession("session-1", server, user, "127.0.0.1", 120, 36);
        manager.attachWebSocket("session-1", 9L, webSocketSession);

        when(serverModuleGateService.isEnabled()).thenReturn(false);
        manager.onEnvVarUpdated(PlatformEnvVarRegistry.KEY_SERVER_MODULE_ENABLED);

        verify(webSocketSession).close(argThat(status -> status.getReason().equals(ServerTerminalSessionManager.REASON_MODULE_DISABLED)));
        assertThat(shellClient.closed).isTrue();

        ArgumentCaptor<ServerTerminalSessionLogEntity> captor = ArgumentCaptor.forClass(ServerTerminalSessionLogEntity.class);
        verify(serverTerminalSessionLogRepository, org.mockito.Mockito.atLeast(2)).save(captor.capture());
        assertThat(captor.getValue().getCloseReason()).isEqualTo(ServerTerminalSessionManager.REASON_MODULE_DISABLED);
    }

    private static final class BlockingShellClient implements ServerSshGateway.ServerShellClient {

        private final BlockingInputStream stdout = new BlockingInputStream();
        private final BlockingInputStream stderr = new BlockingInputStream();
        private final OutputStream stdin = OutputStream.nullOutputStream();
        private volatile boolean closed;

        @Override
        public InputStream stdout() {
            return stdout;
        }

        @Override
        public InputStream stderr() {
            return stderr;
        }

        @Override
        public OutputStream stdin() {
            return stdin;
        }

        @Override
        public void resize(int cols, int rows) {
        }

        @Override
        public void close() {
            closed = true;
            stdout.closed = true;
            stderr.closed = true;
        }
    }

    private static final class BlockingInputStream extends InputStream {

        private volatile boolean closed;

        @Override
        public int read() throws IOException {
            while (!closed) {
                try {
                    Thread.sleep(10L);
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                    return -1;
                }
            }
            return -1;
        }
    }
}
