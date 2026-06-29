package com.aiclub.platform.config;

import com.aiclub.platform.websocket.ChatAuthHandshakeInterceptor;
import com.aiclub.platform.websocket.ChatWebSocketHandler;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

/**
 * 聊天室 WebSocket 注册。
 */
@Configuration
public class ChatWebSocketConfig implements WebSocketConfigurer {

    private final ChatWebSocketHandler chatWebSocketHandler;
    private final ChatAuthHandshakeInterceptor chatAuthHandshakeInterceptor;

    public ChatWebSocketConfig(ChatWebSocketHandler chatWebSocketHandler,
                               ChatAuthHandshakeInterceptor chatAuthHandshakeInterceptor) {
        this.chatWebSocketHandler = chatWebSocketHandler;
        this.chatAuthHandshakeInterceptor = chatAuthHandshakeInterceptor;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(chatWebSocketHandler, "/ws/chat")
                .addInterceptors(chatAuthHandshakeInterceptor)
                .setAllowedOriginPatterns("*");
    }
}
