package com.aiclub.platform.service;

import com.aiclub.platform.dto.YaadeProjectContextSummary;
import com.aiclub.platform.dto.YaadeProjectBindingSummary;
import com.aiclub.platform.security.AuthContext;
import com.aiclub.platform.security.AuthContextHolder;
import com.aiclub.platform.security.YaadeProxySessionStore;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.util.Optional;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class YaadeEmbedSessionServiceTests {

    @Mock
    private YaadeProjectSyncService yaadeProjectSyncService;

    @Mock
    private YaadeUserSyncService yaadeUserSyncService;

    @Mock
    private YaadeProxySessionStore yaadeProxySessionStore;

    @Mock
    private YaadeClientService yaadeClientService;

    private YaadeEmbedSessionService yaadeEmbedSessionService;

    @BeforeEach
    void setUp() {
        yaadeEmbedSessionService = new YaadeEmbedSessionService(
                yaadeProjectSyncService,
                yaadeUserSyncService,
                yaadeProxySessionStore,
                yaadeClientService,
                new YaadeProperties(
                        "http://localhost:9339/api/yaade/proxy",
                        "admin",
                        "admin-password",
                        "default-password",
                        "未关联项目",
                        120
                )
        );
        AuthContextHolder.set(new AuthContext(18L, "tester", "测试用户", Set.of("USER"), Set.of("api:view"), "token-a"));
    }

    @AfterEach
    void tearDown() {
        AuthContextHolder.clear();
    }

    @Test
    void shouldCreatePublicEmbedSessionAndWriteProxyCookie() {
        YaadeProjectBindingSummary binding = new YaadeProjectBindingSummary(
                null,
                true,
                true,
                88L,
                "aiclub-api-public",
                YaadeProjectSyncService.STATUS_ACTIVE,
                "未关联项目",
                null,
                null
        );
        when(yaadeProjectSyncService.ensurePublicCollection())
                .thenReturn(new YaadeProjectSyncService.EnsureProjectBindingResult(binding, true));
        when(yaadeProjectSyncService.listVisibleProjectContextsEnsuringBindings())
                .thenReturn(List.of(
                        new YaadeProjectContextSummary(7L, "CRM项目", 51L, "aiclub-project-7")
                ));
        when(yaadeUserSyncService.loginCurrentUserWithSyncedGroups(null))
                .thenReturn(new YaadeUserSyncService.YaadeAuthenticatedUserSession(
                        "aiclub-18",
                        new YaadeClientService.YaadeSession("vertx-web.session=session-a"),
                        101L
                ));

        MockHttpServletResponse response = new MockHttpServletResponse();
        var summary = yaadeEmbedSessionService.createEmbedSession(null, new MockHttpServletRequest(), response);

        assertThat(summary.binding().yaadeCollectionId()).isEqualTo(88L);
        assertThat(summary.iframePath()).isEqualTo("/api/yaade/proxy/#/88");
        assertThat(summary.projectContexts()).hasSize(1);
        assertThat(summary.projectContexts().get(0).projectId()).isEqualTo(7L);
        assertThat(response.getHeader("Set-Cookie")).contains(YaadeProxySessionStore.COOKIE_NAME);
        verify(yaadeProxySessionStore).save(anyString(), any(YaadeProxySessionStore.ProxySessionSnapshot.class), any());
    }

    @Test
    void shouldClearProxySessionCookieOnLogout() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setCookies(new jakarta.servlet.http.Cookie(YaadeProxySessionStore.COOKIE_NAME, "proxy-session"));
        MockHttpServletResponse response = new MockHttpServletResponse();

        yaadeEmbedSessionService.clearProxySession(request, response);

        verify(yaadeProxySessionStore).delete("proxy-session");
        assertThat(response.getHeader("Set-Cookie")).contains("Max-Age=0");
    }

    @Test
    void shouldRefreshRemoteSessionWhenProxyCookieExists() {
        when(yaadeProxySessionStore.get("proxy-session"))
                .thenReturn(Optional.of(new YaadeProxySessionStore.ProxySessionSnapshot(18L, "aiclub-18", "cookie-old")));
        when(yaadeUserSyncService.reauthenticateManagedUser(18L))
                .thenReturn(new YaadeUserSyncService.YaadeAuthenticatedUserSession(
                        "aiclub-18",
                        new YaadeClientService.YaadeSession("cookie-new"),
                        101L
                ));

        YaadeProxySessionStore.ProxySessionSnapshot snapshot = yaadeEmbedSessionService.refreshRemoteSession("proxy-session");

        assertThat(snapshot.remoteCookieHeader()).isEqualTo("cookie-new");
        verify(yaadeProxySessionStore).save(anyString(), any(YaadeProxySessionStore.ProxySessionSnapshot.class), any());
    }
}
