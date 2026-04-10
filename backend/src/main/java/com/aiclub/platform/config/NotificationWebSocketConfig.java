package com.aiclub.platform.config;

import com.aiclub.platform.websocket.NotificationAuthHandshakeInterceptor;
import com.aiclub.platform.websocket.NotificationWebSocketHandler;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Configuration
@EnableWebSocket
public class NotificationWebSocketConfig implements WebSocketConfigurer {

    private final NotificationWebSocketHandler notificationWebSocketHandler;
    private final NotificationAuthHandshakeInterceptor notificationAuthHandshakeInterceptor;

    public NotificationWebSocketConfig(NotificationWebSocketHandler notificationWebSocketHandler,
                                       NotificationAuthHandshakeInterceptor notificationAuthHandshakeInterceptor) {
        this.notificationWebSocketHandler = notificationWebSocketHandler;
        this.notificationAuthHandshakeInterceptor = notificationAuthHandshakeInterceptor;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(notificationWebSocketHandler, "/ws/notifications")
                .addInterceptors(notificationAuthHandshakeInterceptor)
                .setAllowedOriginPatterns("*");
    }
}
