package com.aiclub.platform.security;

import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.service.AuthService;
import com.aiclub.platform.service.InternalServiceAuthenticator;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;

import java.io.IOException;

@Component
public class AuthInterceptor implements HandlerInterceptor {

    private final AuthService authService;
    private final InternalServiceAuthenticator internalServiceAuthenticator;
    private final ObjectMapper objectMapper;

    public AuthInterceptor(AuthService authService,
                           InternalServiceAuthenticator internalServiceAuthenticator,
                           ObjectMapper objectMapper) {
        this.authService = authService;
        this.internalServiceAuthenticator = internalServiceAuthenticator;
        this.objectMapper = objectMapper;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true;
        }

        String requestUri = request.getRequestURI();
        if (isSftpDownloadTicketRequest(requestUri, request) || isPublicPath(requestUri)) {
            return true;
        }

        String authHeader = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (isInternalActuatorPath(requestUri) && authHeader != null && !authHeader.isBlank()) {
            try {
                internalServiceAuthenticator.requireAuthorized(authHeader, request.getRemoteAddr());
                return true;
            } catch (RuntimeException ignored) {
                // 若不是内部服务 Token，则继续按普通登录态校验。
            }
        }
        if (authHeader == null || authHeader.isBlank()) {
            writeJson(response, HttpStatus.UNAUTHORIZED, "Not logged in or session expired");
            return false;
        }

        AuthContext authContext;
        try {
            authContext = authService.authenticate(authHeader);
        } catch (RuntimeException ex) {
            writeJson(response, HttpStatus.UNAUTHORIZED, ex.getMessage());
            return false;
        }

        AuthContextHolder.set(authContext);
        if (handler instanceof HandlerMethod handlerMethod) {
            RequirePermission permission = findPermission(handlerMethod);
            if (permission != null && !hasRequiredPermission(authContext, permission)) {
                writeJson(response, HttpStatus.FORBIDDEN, "You do not have permission to access this resource");
                return false;
            }
        }
        return true;
    }

    /** GitPilot 新旧权限并行发布期间按 OR 语义校验，避免自定义角色被旧编码卡住。 */
    private boolean hasRequiredPermission(AuthContext authContext, RequirePermission permission) {
        if (authContext.hasPermission(permission.value())) return true;
        for (String fallback : permission.anyOf()) {
            if (authContext.hasPermission(fallback)) return true;
        }
        return false;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) {
        AuthContextHolder.clear();
    }

    private boolean isPublicPath(String requestUri) {
        // 登录、注册、健康检查等接口需要允许匿名访问，否则未登录用户无法完成注册和登录流程。
        return requestUri.startsWith("/api/auth/login")
                || requestUri.startsWith("/api/auth/register")
                || requestUri.startsWith("/api/cicd/public/")
                || requestUri.startsWith("/api/gitlab/public/")
                || requestUri.startsWith("/api/common/public-files/")
                || requestUri.startsWith("/comment-images")
                || requestUri.startsWith("/actuator/health")
                || requestUri.startsWith("/error");
    }

    private boolean isInternalActuatorPath(String requestUri) {
        return requestUri.startsWith("/actuator/prometheus")
                || requestUri.startsWith("/actuator/metrics")
                || requestUri.startsWith("/actuator/info");
    }

    private boolean isSftpDownloadTicketRequest(String requestUri, HttpServletRequest request) {
        if (!"GET".equalsIgnoreCase(request.getMethod())
                || !requestUri.matches("/api/servers/\\d+/sftp/download")) {
            return false;
        }
        String ticket = request.getParameter("ticket");
        return ticket != null && !ticket.isBlank();
    }

    private RequirePermission findPermission(HandlerMethod handlerMethod) {
        RequirePermission methodPermission = handlerMethod.getMethodAnnotation(RequirePermission.class);
        if (methodPermission != null) {
            return methodPermission;
        }
        return handlerMethod.getBeanType().getAnnotation(RequirePermission.class);
    }

    private void writeJson(HttpServletResponse response, HttpStatus status, String message) throws IOException {
        response.setStatus(status.value());
        response.setCharacterEncoding("UTF-8");
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter().write(objectMapper.writeValueAsString(ApiResponse.fail(message)));
    }
}
