package com.aiclub.platform.security;

import com.aiclub.platform.service.AuthService;
import com.aiclub.platform.service.GitPilotCliService;
import com.aiclub.platform.service.InternalServiceAuthenticator;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/** 校验 Desktop updater 和公众下载接口未登录时能穿过统一认证拦截器。 */
class AuthInterceptorPublicPathTests {

    @ParameterizedTest
    @ValueSource(strings = {
            "/api/desktop-updates/windows/x86_64/nsis/0.1.0",
            "/api/desktop-releases/latest?channel=stable",
            "/api/desktop-releases/artifacts/42/download"
    })
    void shouldAllowAnonymousDesktopReleaseReads(String path) throws Exception {
        AuthInterceptor interceptor = new AuthInterceptor(
                mock(AuthService.class),
                mock(InternalServiceAuthenticator.class),
                mock(GitPilotCliService.class),
                new ObjectMapper());

        MockHttpServletRequest request = new MockHttpServletRequest("GET", path);
        boolean allowed = interceptor.preHandle(request, new MockHttpServletResponse(), new Object());

        assertThat(allowed).isTrue();
    }
}
