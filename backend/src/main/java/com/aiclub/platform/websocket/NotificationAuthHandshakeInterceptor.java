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

@Component
public class NotificationAuthHandshakeInterceptor implements HandshakeInterceptor {

    private static final String USER_ID_ATTR = "notificationUserId";

    private final AuthService authService;

    public NotificationAuthHandshakeInterceptor(AuthService authService) {
        this.authService = authService;
    }

    @Override
    public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response, WebSocketHandler wsHandler, Map<String, Object> attributes) {
        String token = resolveToken(request.getURI());
        if (token == null) {
            return false;
        }
        try {
            AuthContext authContext = authService.authenticate(token.startsWith("Bearer ") ? token : "Bearer " + token);
            attributes.put(USER_ID_ATTR, authContext.userId());
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
