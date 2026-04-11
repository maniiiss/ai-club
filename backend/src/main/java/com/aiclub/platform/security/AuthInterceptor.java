package com.aiclub.platform.security;

import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.service.AuthService;
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
    private final ObjectMapper objectMapper;

    public AuthInterceptor(AuthService authService, ObjectMapper objectMapper) {
        this.authService = authService;
        this.objectMapper = objectMapper;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true;
        }

        String requestUri = request.getRequestURI();
        if (isPublicPath(requestUri)) {
            return true;
        }

        String authHeader = request.getHeader(HttpHeaders.AUTHORIZATION);
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
            if (permission != null && !authContext.hasPermission(permission.value())) {
                writeJson(response, HttpStatus.FORBIDDEN, "You do not have permission to access this resource");
                return false;
            }
        }
        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) {
        AuthContextHolder.clear();
    }

    private boolean isPublicPath(String requestUri) {
        // 登录、注册、健康检查等接口需要允许匿名访问，否则未登录用户无法完成注册和登录流程。
        return requestUri.startsWith("/api/auth/login")
                || requestUri.startsWith("/api/auth/register")
                || requestUri.startsWith("/actuator")
                || requestUri.startsWith("/error");
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
