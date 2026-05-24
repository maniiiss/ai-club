package com.aiclub.platform.websocket;

import com.aiclub.platform.security.AuthContext;
import com.aiclub.platform.service.AuthService;
import com.aiclub.platform.service.ServerModuleGateService;
import com.aiclub.platform.service.ServerTerminalSessionManager;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/**
 * 服务器终端 WebSocket 鉴权拦截器。
 */
@Component
public class ServerTerminalAuthHandshakeInterceptor implements HandshakeInterceptor {

    static final String USER_ID_ATTR = "serverTerminalUserId";
    static final String SESSION_ID_ATTR = "serverTerminalSessionId";

    private final AuthService authService;
    private final ServerModuleGateService serverModuleGateService;
    private final ServerTerminalSessionManager serverTerminalSessionManager;

    public ServerTerminalAuthHandshakeInterceptor(AuthService authService,
                                                  ServerModuleGateService serverModuleGateService,
                                                  ServerTerminalSessionManager serverTerminalSessionManager) {
        this.authService = authService;
        this.serverModuleGateService = serverModuleGateService;
        this.serverTerminalSessionManager = serverTerminalSessionManager;
    }

    @Override
    public boolean beforeHandshake(ServerHttpRequest request,
                                   ServerHttpResponse response,
                                   WebSocketHandler wsHandler,
                                   Map<String, Object> attributes) {
        if (!serverModuleGateService.isEnabled()) {
            return false;
        }
        Map<String, String> params = resolveQueryParams(request.getURI());
        String token = params.get("token");
        String sessionId = params.get("sessionId");
        if (token == null || sessionId == null) {
            return false;
        }
        try {
            AuthContext authContext = authService.authenticate(token.startsWith("Bearer ") ? token : "Bearer " + token);
            if (!authContext.hasPermission("server:terminal")) {
                return false;
            }
            if (!serverTerminalSessionManager.canOpenSession(sessionId, authContext.userId())) {
                return false;
            }
            attributes.put(USER_ID_ATTR, authContext.userId());
            attributes.put(SESSION_ID_ATTR, sessionId);
            return true;
        } catch (RuntimeException exception) {
            return false;
        }
    }

    @Override
    public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response, WebSocketHandler wsHandler, Exception exception) {
    }

    private Map<String, String> resolveQueryParams(URI uri) {
        Map<String, String> params = new HashMap<>();
        String query = uri.getRawQuery();
        if (query == null || query.isBlank()) {
            return params;
        }
        for (String part : query.split("&")) {
            String[] pair = part.split("=", 2);
            if (pair.length == 2) {
                params.put(pair[0], URLDecoder.decode(pair[1], StandardCharsets.UTF_8));
            }
        }
        return params;
    }
}
