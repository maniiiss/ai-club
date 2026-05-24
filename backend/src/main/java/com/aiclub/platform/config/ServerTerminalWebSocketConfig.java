package com.aiclub.platform.config;

import com.aiclub.platform.websocket.ServerTerminalAuthHandshakeInterceptor;
import com.aiclub.platform.websocket.ServerTerminalWebSocketHandler;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

/**
 * 服务器终端 WebSocket 注册。
 */
@Configuration
public class ServerTerminalWebSocketConfig implements WebSocketConfigurer {

    private final ServerTerminalWebSocketHandler serverTerminalWebSocketHandler;
    private final ServerTerminalAuthHandshakeInterceptor serverTerminalAuthHandshakeInterceptor;

    public ServerTerminalWebSocketConfig(ServerTerminalWebSocketHandler serverTerminalWebSocketHandler,
                                         ServerTerminalAuthHandshakeInterceptor serverTerminalAuthHandshakeInterceptor) {
        this.serverTerminalWebSocketHandler = serverTerminalWebSocketHandler;
        this.serverTerminalAuthHandshakeInterceptor = serverTerminalAuthHandshakeInterceptor;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(serverTerminalWebSocketHandler, "/ws/server-terminals")
                .addInterceptors(serverTerminalAuthHandshakeInterceptor)
                .setAllowedOriginPatterns("*");
    }
}
