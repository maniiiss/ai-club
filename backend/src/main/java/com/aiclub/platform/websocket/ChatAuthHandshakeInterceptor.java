package com.aiclub.platform.websocket;

import com.aiclub.platform.security.AuthContext;
import com.aiclub.platform.service.AuthService;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * 聊天室 WebSocket 鉴权拦截器。
 * 业务意图：WebSocket 没有 Axios 拦截器，使用 query token 复用现有登录 token 鉴权。
 */
@Component
public class ChatAuthHandshakeInterceptor implements HandshakeInterceptor {

    public static final String AUTH_CONTEXT_ATTR = "chatAuthContext";

    private final AuthService authService;

    public ChatAuthHandshakeInterceptor(AuthService authService) {
        this.authService = authService;
    }

    @Override
    public boolean beforeHandshake(ServerHttpRequest request,
                                   ServerHttpResponse response,
                                   WebSocketHandler wsHandler,
                                   Map<String, Object> attributes) {
        String token = resolveToken(request.getURI());
        if (token == null || token.isBlank()) {
            return false;
        }
        try {
            AuthContext authContext = authService.authenticate(token.startsWith("Bearer ") ? token : "Bearer " + token);
            attributes.put(AUTH_CONTEXT_ATTR, authContext);
            return true;
        } catch (RuntimeException exception) {
            return false;
        }
    }

    @Override
    public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response, WebSocketHandler wsHandler, Exception exception) {
    }

    private String resolveToken(URI uri) {
        String query = uri.getRawQuery();
        if (query == null || query.isBlank()) {
            return null;
        }
        for (String part : query.split("&")) {
            String[] pair = part.split("=", 2);
            if (pair.length == 2 && "token".equals(pair[0])) {
                return URLDecoder.decode(pair[1], StandardCharsets.UTF_8);
            }
        }
        return null;
    }
}
