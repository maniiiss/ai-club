package com.aiclub.platform.security;

import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.service.AuthService;
import com.aiclub.platform.service.GitPilotCliService;
import com.aiclub.platform.service.InternalServiceAuthenticator;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.method.HandlerMethod;

import java.lang.reflect.Method;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 校验 CLI Token（gpt_ 前缀）在 /api/cli/ 之外的公众端业务接口上也能完成认证。
 * 业务背景：桌面端 Work 模式的公众端工具使用 CLI 凭据调用 /api/tasks、/api/projects，
 * 修复前这些请求会误走 Web JWT 校验链并统一返回 401。
 */
class AuthInterceptorCliTokenRoutingTests {

    private AuthService authService;
    private GitPilotCliService cliService;
    private AuthInterceptor interceptor;
    private HandlerMethod taskListHandler;

    @BeforeEach
    void setUp() throws Exception {
        authService = mock(AuthService.class);
        cliService = mock(GitPilotCliService.class);
        interceptor = new AuthInterceptor(
                authService,
                mock(InternalServiceAuthenticator.class),
                cliService,
                new ObjectMapper());
        taskListHandler = new HandlerMethod(new DummyTaskEndpoint(), taskListMethod());
    }

    @AfterEach
    void clearAuthContext() {
        AuthContextHolder.clear();
    }

    @Test
    void shouldAuthenticateCliTokenOnPublicSideTaskApi() throws Exception {
        when(cliService.normalizeAuthorization("Bearer gpt_token123")).thenReturn("gpt_token123");
        when(cliService.isCliToken("gpt_token123")).thenReturn(true);
        when(cliService.authenticateCliToken("gpt_token123"))
                .thenReturn(new AuthContext(7L, "cli-user", "CLI 用户", Set.of(), Set.of("task:view"), "gpt_token123"));

        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/tasks");
        request.addHeader("Authorization", "Bearer gpt_token123");
        MockHttpServletResponse response = new MockHttpServletResponse();

        boolean allowed = interceptor.preHandle(request, response, taskListHandler);

        assertThat(allowed).isTrue();
        assertThat(response.getStatus()).isEqualTo(200);
        verify(cliService).authenticateCliToken("gpt_token123");
        verify(authService, never()).authenticate(anyString());
        assertThat(AuthContextHolder.get()).map(AuthContext::userId).contains(7L);
    }

    @Test
    void shouldKeepWebJwtRoutingForNonCliTokens() throws Exception {
        when(cliService.normalizeAuthorization("Bearer eyJwebjwt")).thenReturn("eyJwebjwt");
        when(cliService.isCliToken("eyJwebjwt")).thenReturn(false);
        when(authService.authenticate("Bearer eyJwebjwt"))
                .thenReturn(new AuthContext(8L, "web-user", "Web 用户", Set.of(), Set.of("task:view"), "eyJwebjwt"));

        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/tasks");
        request.addHeader("Authorization", "Bearer eyJwebjwt");
        MockHttpServletResponse response = new MockHttpServletResponse();

        boolean allowed = interceptor.preHandle(request, response, taskListHandler);

        assertThat(allowed).isTrue();
        verify(authService).authenticate("Bearer eyJwebjwt");
        verify(cliService, never()).authenticateCliToken(anyString());
    }

    @Test
    void shouldRejectCliTokenWithoutTaskViewPermission() throws Exception {
        when(cliService.normalizeAuthorization("Bearer gpt_token123")).thenReturn("gpt_token123");
        when(cliService.isCliToken("gpt_token123")).thenReturn(true);
        when(cliService.authenticateCliToken("gpt_token123"))
                .thenReturn(new AuthContext(7L, "cli-user", "CLI 用户", Set.of(), Set.of(), "gpt_token123"));

        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/tasks");
        request.addHeader("Authorization", "Bearer gpt_token123");
        MockHttpServletResponse response = new MockHttpServletResponse();

        boolean allowed = interceptor.preHandle(request, response, taskListHandler);

        assertThat(allowed).isFalse();
        assertThat(response.getStatus()).isEqualTo(403);
    }

    /** 模拟带 @RequirePermission("task:view") 的公众端工作项列表端点。 */
    static class DummyTaskEndpoint {
        @RequirePermission("task:view")
        public void list() {
        }
    }

    private Method taskListMethod() throws Exception {
        return DummyTaskEndpoint.class.getMethod("list");
    }
}
